import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as C from '../constants';
import { convertWindowsPathToWsl } from '../utils/helper';

let currentAsirTerminal: vscode.Terminal | null = null;
export let debugTerminalClosedPromise: Promise<void> | undefined;
export let debugTerminalClosedResolve: (() => void) | undefined;

export function registerDebugCommands(
    context: vscode.ExtensionContext,
    asirOutputChannel: vscode.OutputChannel,
    startSessionStatusBarItem: vscode.StatusBarItem,
    stopSessionStatusBarItem: vscode.StatusBarItem
) {
    let disposableStartAsirDebug = vscode.commands.registerCommand(C.COMMAND_START_ASIR_INTERACTIVE, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active text editor to debug Risa/Asir code from.');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const codeToDebug = document.getText(selection.isEmpty ? undefined : selection);

        if (codeToDebug.trim().length === 0) {
            vscode.window.showInformationMessage('No code selected or current line is empty for debugging.');
            return;
        }

        const tempDir = os.tmpdir();
        const uniqueId = Math.random().toString(36).substring(2, 15);
        const tempFileName = `vscode_asir_debug_${uniqueId}.rr`;
        const windowsTempFilePath = path.join(tempDir, tempFileName);

        try {
            fs.writeFileSync(windowsTempFilePath, codeToDebug + '\n', 'utf8');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save temporary file for debugging: ${error.message}`);
            return;
        }

        if (!currentAsirTerminal) {
            vscode.window.showInformationMessage('Starting Risa/Asir debug session...');
            const resourceUri = editor.document.uri;
            const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR, resourceUri);
            const debugStartupDelay = config.get<number>(C.CONFIG_DEBUG_STARTUP_DELAY, 3000);

            let commandLine: string;
            const currentOsPlatform = process.platform;

            if (currentOsPlatform === 'win32') {
                const useWslFromWindows = config.get<boolean>(C.CONFIG_USE_WSL, false);
                if (useWslFromWindows) {
                    const wslDistribution = config.get<string>(C.CONFIG_WSL_DISTRIBUTION, 'Ubuntu');
                    const asirPathLinux = config.get<string>(C.CONFIG_ASIR_PATH_LINUX, 'asir');
                    const bashCommand = `script -q -c '${asirPathLinux}' /dev/null ; exit`;
                    commandLine = `wsl -d ${wslDistribution} -e bash -c "${bashCommand}"`;
                } else {
                    const asirPathWindows = config.get<string>(C.CONFIG_ASIR_PATH_WINDOWS, 'asir.exe');
                    commandLine = `"${asirPathWindows}" ; exit`;
                }
            } else if (currentOsPlatform === 'darwin' || currentOsPlatform === 'linux') {
                const asirPath = currentOsPlatform === 'darwin' ? config.get<string>(C.CONFIG_ASIR_PATH_MAC, 'asir') : config.get<string>(C.CONFIG_ASIR_PATH_LINUX, 'asir');
                commandLine = `stdbuf -o0 "${asirPath}" ; exit`;
            } else {
                vscode.window.showErrorMessage(`Unsupported OS platform: ${currentOsPlatform}`);
                fs.unlinkSync(windowsTempFilePath);
                return;
            }

            currentAsirTerminal = vscode.window.createTerminal({
                name: 'Risa/Asir Interactive',
                shellPath: undefined,
                shellArgs: [],
                cwd: resourceUri ? path.dirname(resourceUri.fsPath) : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath),
                hideFromUser: false
            });
            context.subscriptions.push(currentAsirTerminal);

            context.subscriptions.push(vscode.window.onDidCloseTerminal(e => {
                if (e === currentAsirTerminal) {
                    vscode.window.showInformationMessage('Risa/Asir debug session terminal closed.');
                    currentAsirTerminal = null;
                    startSessionStatusBarItem.show();
                    stopSessionStatusBarItem.hide();
                    try { fs.unlinkSync(windowsTempFilePath); } catch (err) { console.error(`Failed to delete temporary file: ${err}`); }
                    if (debugTerminalClosedResolve) {
                        debugTerminalClosedResolve();
                        debugTerminalClosedResolve = undefined;
                        debugTerminalClosedPromise = undefined;
                    }
                }
            }));

            currentAsirTerminal.show(true);
            startSessionStatusBarItem.hide();
            stopSessionStatusBarItem.show();
            currentAsirTerminal.sendText(commandLine);
            await new Promise(resolve => setTimeout(resolve, debugStartupDelay));

        } else {
            vscode.window.showInformationMessage('Existing Risa/Asir debug session found. Loading code into it.');
            currentAsirTerminal.show(true);
            const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR, editor.document.uri);
            const debugStartupDelay = config.get<number>(C.CONFIG_DEBUG_STARTUP_DELAY, 500);
            await new Promise(resolve => setTimeout(resolve, debugStartupDelay > 0 ? debugStartupDelay / 2 : 500));
        }

        let loadCommand: string;
        const currentOsPlatform = process.platform;
        const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR, document.uri);
        const useWslFromWindows = config.get<boolean>(C.CONFIG_USE_WSL, false);

        if (currentOsPlatform === 'win32' && useWslFromWindows) {
            const wslTempFilePath = convertWindowsPathToWsl(windowsTempFilePath);
            loadCommand = `load("${wslTempFilePath}");`;
        } else {
            loadCommand = `load("${windowsTempFilePath.replace(/\\/g, '/')}");`;
        }

        asirOutputChannel.appendLine(`> ${loadCommand}`);
        currentAsirTerminal.sendText(loadCommand);
        await new Promise(resolve => setTimeout(resolve, 500));

        const debugStartupDelay = config.get<number>(C.CONFIG_DEBUG_STARTUP_DELAY, 3000);
        vscode.window.showInformationMessage(
            'Code loaded for debugging. Call your function (e.g., `myfunc(1);`) in the "Risa/Asir Debug" terminal and use Ctrl+C then "d" to enter debug mode.' +
            ` If loading fails, try increasing the "Risa/Asir Executor: Debug Startup Delay" setting (currently ${debugStartupDelay}ms).`
        );

        debugTerminalClosedPromise = new Promise<void>(resolve => {
            debugTerminalClosedResolve = resolve;
        });
        await debugTerminalClosedPromise;
    });
    context.subscriptions.push(disposableStartAsirDebug);

    let disposableStopAsirInteractive = vscode.commands.registerCommand(C.COMMAND_STOP_ASIR_INTERACTIVE, async () => {
        if (!currentAsirTerminal) {
            vscode.window.showInformationMessage('No Risa/Asir debug session is currently running.');
            return;
        }
        vscode.window.showInformationMessage('Stopping Risa/Asir debug session...');
        asirOutputChannel.appendLine('--- Sending \'quit;\' to Risa/Asir debug terminal ---');
        currentAsirTerminal.sendText('quit;');

        const terminalClosedByQuit = new Promise<void>(resolve => {
            let disposableListener = vscode.window.onDidCloseTerminal(e => {
                if (e === currentAsirTerminal) {
                    disposableListener.dispose();
                    resolve();
                }
            });
        });

        const timeout = new Promise<void>(resolve => setTimeout(resolve, 5000));
        await Promise.race([terminalClosedByQuit, timeout]);

        if (currentAsirTerminal) {
            vscode.window.showWarningMessage('Risa/Asir debug terminal did not close gracefully. Disposing it forcefully.');
            asirOutputChannel.appendLine(`--- Forcing termination of Risa/Asir debug terminal... ---`);
            currentAsirTerminal.dispose();
        }
        vscode.window.showInformationMessage('Risa/Asir debug session stopped.');
    });
    context.subscriptions.push(disposableStopAsirInteractive);
}
