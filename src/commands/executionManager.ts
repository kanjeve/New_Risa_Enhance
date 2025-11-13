import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { TextDecoder } from 'util';
import * as C from '../constants';
import { convertWindowsPathToWsl } from '../utils/helper';
import { createResultWebview } from '../utils/webviewUtils';
import { CwrapSessionManager } from '../utils/cwrapSession';

// This is a workaround to check if a debug session is active.
// A better approach would be to have a centralized state manager.
let currentAsirTerminal: vscode.Terminal | null = null;
vscode.window.onDidOpenTerminal(t => {
    if (t.name === 'Risa/Asir Interactive') {
        currentAsirTerminal = t;
    }
});
vscode.window.onDidCloseTerminal(t => {
    if (t === currentAsirTerminal) {
        currentAsirTerminal = null;
    }
});


class ExecutionManager implements vscode.Disposable {
    private process: ChildProcessWithoutNullStreams | null = null;
    private readonly context: vscode.ExtensionContext;
    private readonly asirOutputChannel: vscode.OutputChannel;
    private readonly asirCancelStatusBarItem: vscode.StatusBarItem;

    constructor(context: vscode.ExtensionContext, asirOutputChannel: vscode.OutputChannel, asirCancelStatusBarItem: vscode.StatusBarItem) {
        this.context = context;
        this.asirOutputChannel = asirOutputChannel;
        this.asirCancelStatusBarItem = asirCancelStatusBarItem;
    }

    public isBusy(): boolean {
        return this.process !== null;
    }

    public dispose() {
        this.cancel();
    }

    public cancel() {
        if (!this.process) {
            return;
        }
        this.asirOutputChannel.appendLine(`--- Cancelling Risa/Asir normal execution process... ---`);
        try {
            const pid = this.process.pid;
            if (pid) {
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/F', '/T', '/PID', pid.toString()]);
                } else {
                    process.kill(-pid, 'SIGKILL');
                }
                vscode.window.showInformationMessage('Risa/Asir normal execution cancelled.');
                this.asirOutputChannel.appendLine(`--- Risa/Asir normal execution successfully cancelled ---`);
            }
        } catch (error: any) {
            console.error('Error during Risa/Asir cancellation:', error);
            vscode.window.showErrorMessage(`Failed to cancel Risa/Asir: ${error.message}.`);
        } finally {
            this.process = null;
            this.asirCancelStatusBarItem.hide();
        }
    }

    public async start(textToExecute: string, document: vscode.TextDocument) {
        let tempFilePath: string;
        let cleanupTempFile: () => void;

        try {
            ({ tempFilePath, cleanupTempFile } = this._prepareExecution(textToExecute));
            const { command, args, options, displayMessage } = this._buildSpawnArguments(tempFilePath, document);
            await this._launchAndMonitorProcess(command, args, options, displayMessage, textToExecute, cleanupTempFile);
        } catch (error: any) {
            this.process = null;
            this.asirCancelStatusBarItem.hide();
            this.asirOutputChannel.appendLine(`General error during Risa/Asir execution: ${error.message}`);
            vscode.window.showErrorMessage(`An unexpected error occured during Risa/Asir exection: ${error.message}`);
            createResultWebview(this.context, textToExecute, '', error.message);
        }
    }

    private _prepareExecution(textToExecute: string): { tempFilePath: string, cleanupTempFile: () => void } {
        const tempDir = os.tmpdir();
        const uniqueId = Math.random().toString(36).substring(2, 15);
        const tempFileName = `vscode_asir_exec_temp_${uniqueId}.rr`;
        const tempFilePath = path.join(tempDir, tempFileName);

        try {
            fs.writeFileSync(tempFilePath, textToExecute + '\n', 'utf8');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save temporary file for execution: ${error.message}`);
            throw error;
        }

        const cleanupTempFile = () => {
            try { fs.unlinkSync(tempFilePath); } catch (err) { console.error(`Failed to delete temporary file: ${err}`); }
        };

        return { tempFilePath, cleanupTempFile };
    }

    private _buildSpawnArguments(tempFilePath: string, document: vscode.TextDocument): { command: string, args: string[], options: any, displayMessage: string } {
        let workspaceRoot: string | undefined;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            workspaceRoot = workspaceFolder.uri.fsPath;
        } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else {
            workspaceRoot = path.dirname(document.uri.fsPath);
        }

        const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR, document.uri);
        let command: string;
        let args: string[] = [];
        let displayMessage: string;
        let options: { shell?: boolean; detached?: boolean; maxBuffer?: number; cwd?: string; } = { cwd: workspaceRoot };

        const currentOsPlatform = process.platform;

        if (currentOsPlatform === 'win32') {
            const useWslFromWindows = config.get<boolean>(C.CONFIG_USE_WSL, false);
            if (useWslFromWindows) {
                const wslDistribution = config.get<string>(C.CONFIG_WSL_DISTRIBUTION, 'Ubuntu');
                const asirPathLinux = config.get<string>(C.CONFIG_ASIR_PATH_LINUX, 'asir');
                const wslTempFilePath = convertWindowsPathToWsl(tempFilePath);
                const wslWorkspaceRoot = workspaceRoot ? convertWindowsPathToWsl(workspaceRoot) : '.';
                command = 'wsl';
                const bashCommandString = `bash -c " cd '${wslWorkspaceRoot}' && ${asirPathLinux} -quiet -f '${wslTempFilePath}'"`;
                args = ['-d', wslDistribution, bashCommandString];
                displayMessage = `Executing Risa/Asir WSL (${wslDistribution})...`;
                options.shell = true;
            } else {
                const asirPathWindows = config.get<string>(C.CONFIG_ASIR_PATH_WINDOWS);
                command = `"${asirPathWindows}" -quiet`;
                args = [];
                displayMessage = 'Executing Risa/Asir on Windows natively...';
                options.shell = true;
            }
        } else if (currentOsPlatform === 'darwin' || currentOsPlatform === 'linux') {
            const asirPath = currentOsPlatform === 'darwin' ? config.get<string>(C.CONFIG_ASIR_PATH_MAC, 'asir') : config.get<string>(C.CONFIG_ASIR_PATH_LINUX, 'asir');
            command = asirPath;
            args = ['-quiet', '-f', tempFilePath];
            displayMessage = `Executing Risa/Asir on ${currentOsPlatform}...`;
            options.detached = true;
            options.shell = true;
        } else {
            throw new Error(`Unsupported OS platform: ${currentOsPlatform}`);
        }

        options.maxBuffer = 1024 * 1024 * 100;
        return { command, args, options, displayMessage };
    }

    private _launchAndMonitorProcess(command: string, args: string[], options: any, displayMessage: string, originalText: string, cleanup: () => void) {
        return new Promise<void>((resolve, reject) => {
            this.asirOutputChannel.clear();
            this.asirOutputChannel.show(true);
            this.asirOutputChannel.appendLine(`--- ${displayMessage} ---`);
            this.asirCancelStatusBarItem.show();

            this.process = spawn(command, args, options);

            if (process.platform === 'win32' && !options.shell) { 
                const fullCommand = originalText + '\nquit$\n';
                this.process.stdin.write(fullCommand);
                this.process.stdin.end();
            }

            let outputAccumulator = '';
            let errorAccumulator = '';

            this.process.stdout.on('data', (data: Buffer) => {
                const decodedString = (process.platform === 'win32' && !options.shell)
                    ? new TextDecoder('shift-jis').decode(data)
                    : data.toString();
                outputAccumulator += decodedString;
                this.asirOutputChannel.append(decodedString);
            });

            this.process.stderr.on('data', (data: Buffer) => {
                const errorString = (process.platform === 'win32' && !options.shell)
                    ? new TextDecoder('shift-jis').decode(data)
                    : data.toString();
                errorAccumulator += errorString;
                this.asirOutputChannel.appendLine(`Error from Risa/Asir: ${errorString}`);
            });

            this.process.on('close', (code) => {
                this.process = null;
                this.asirCancelStatusBarItem.hide();
                cleanup();

                let finalErrorMessage = errorAccumulator;
                let isSuccessfulExit = false;

                const errorLines = errorAccumulator.split('\n');
                const filteredErrorLines = [];
                const timeOutputLines = [];
                const timeRegex = /^\s*[\d\.\-\+eE]+sec(\s*\([\d\.\-\+eE]+sec\))?\s*$/;

                for (const line of errorLines) {
                    if (line.trim().length > 0 && timeRegex.test(line)) {
                        timeOutputLines.push(line);
                    } else {
                        filteredErrorLines.push(line);
                    }
                }

                if (timeOutputLines.length > 0) {
                    const timeOutput = timeOutputLines.join('\n');
                    if (outputAccumulator.length > 0 && !outputAccumulator.endsWith('\n')) {
                        outputAccumulator += '\n';
                    }
                    outputAccumulator += timeOutput;
                }
                
                finalErrorMessage = filteredErrorLines.join('\n').trim();

                const normalQuitMessage =[
                    /(^|\s)Calling the registered quit callbacks\.\.\.done\.(\s|$)/gm,
                    /(^|\s)return to toplevel(\s|$)/gm
                ];

                normalQuitMessage.forEach(regex => {
                    if (finalErrorMessage.match(regex)) {
                        finalErrorMessage = finalErrorMessage.replace(regex, '').trim();
                    }
                });

                if (errorAccumulator.length > 0 && finalErrorMessage.length === 0) {
                    isSuccessfulExit = true;
                }

                const CANCELLATION_CODES_WIN = [3221225786]; 
                const CANCELLATION_CODES_UNIX = [130, 143]; 

                const isCancelledExit = (
                    (typeof code === 'number' && process.platform === 'win32' && CANCELLATION_CODES_WIN.includes(code)) ||
                    (typeof code === 'number' && (process.platform === 'linux' || process.platform === 'darwin') && CANCELLATION_CODES_UNIX.includes(code))
                );

                if (isSuccessfulExit || (code === 0 && finalErrorMessage.length === 0)) {
                     this.asirOutputChannel.appendLine(`--- Risa/Asir execution finished successfully ---`);
                } else if (typeof code !== 'number' || (code !== 0 && !isCancelledExit)) {
                    this.asirOutputChannel.appendLine(`--- Risa/Asir process exited with code ${code} (Error) ---`);
                    vscode.window.showErrorMessage(`Risa/Asir execution failed with code ${code}. Check 'Risa/Asir CLI Output' for details.`);
                }
                
                createResultWebview(this.context, originalText, outputAccumulator, finalErrorMessage);
                resolve();
            });

            this.process.on('error', (err) => {
                this.process = null;
                this.asirCancelStatusBarItem.hide();
                cleanup();
                this.asirOutputChannel.appendLine(`Failed to start Risa/Asir process: ${err.message}`);
                vscode.window.showErrorMessage(`Failed to start Risa/Asir: ${err.message}. Check if Risa/Asir is installed correctly and path is set in settings.`);
                createResultWebview(this.context, originalText, '', err.message);
                reject(err);
            });
        });
    }
}

export function registerExecutionCommands(
    context: vscode.ExtensionContext,
    asirOutputChannel: vscode.OutputChannel,
    asirCancelStatusBarItem: vscode.StatusBarItem,
    getSessionManager: () => CwrapSessionManager
) {
    const manager = new ExecutionManager(context, asirOutputChannel, asirCancelStatusBarItem);
    context.subscriptions.push(manager);

    context.subscriptions.push(vscode.commands.registerCommand(C.COMMAND_EXECUTE_CODE, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active text editor to execute Risa/Asir code.');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const textToExecute = document.getText(selection.isEmpty ? undefined : selection);

        if (textToExecute.trim().length === 0) {
            vscode.window.showInformationMessage('No code selected or current line is empty.');
            return;
        }

        const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR, document.uri);
        const sessionManager = getSessionManager();
        const useSessionMode = config.get<boolean>(C.CONFIG_USE_SESSION_MODE, false);

        if (currentAsirTerminal) {
            vscode.window.showInformationMessage('sending code to active Risa/Asir debug session.');
            currentAsirTerminal.sendText(textToExecute + '\n'); // Also add newline here
            currentAsirTerminal.show(true);
            return;
        }

        if (useSessionMode && sessionManager.status === 'active') {
            asirOutputChannel.clear();
            asirOutputChannel.show(true);
            asirOutputChannel.appendLine(`--- Executing in persistent Asir session ---`);
            asirOutputChannel.appendLine(`> ${textToExecute}`);

            try {
                const result = await sessionManager.execute(textToExecute);
                asirOutputChannel.appendLine(`[Session RESULT] ${result}`);
                createResultWebview(context, textToExecute, result, '');
            } catch (error: any) {
                const errorMessage = error.message || 'An unknown error occurred.';
                vscode.window.showErrorMessage(errorMessage);
                asirOutputChannel.appendLine(`[Session ERROR] ${errorMessage}`);
                createResultWebview(context, textToExecute, '', errorMessage);
            }
        } else if (useSessionMode) {
            vscode.window.showWarningMessage('Asir session is not active. Please start it first or disable session mode.');
            return;
        } else {
            if (manager.isBusy()) {
                vscode.window.showWarningMessage('A Risa/Asir execution is already running. Please cancel it first.', 'Cancel')
                    .then(selection => {
                        if (selection === 'Cancel') {
                            vscode.commands.executeCommand(C.COMMAND_CANCEL_EXECUTION);
                        }
                    });
                return;
            }
            await manager.start(textToExecute, document);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand(C.COMMAND_CANCEL_EXECUTION, () => {
        manager.cancel();
    }));
}