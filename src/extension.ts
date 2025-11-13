import * as vscode from 'vscode';
import * as path from 'path';

// 各機能モジュールのインポート
import { startAnalysis } from './analysis/analysisCoordinator';

import { registerPackageCompletionProvider } from './features/completionProvider';
import { registerWordCompletionProvider } from './features/wordCompletionProvider';

import { registerHoverProvider } from './features/hoverProvider';
import { registerDefinitionProvider } from './features/definitionProvider';
import { registerFormattingProvider } from './features/formattingProvider';
import { registerRenameProvider } from './features/renameProvider';
import { registerDocumentSymbolProvider } from './features/documentSymbolProvider';
import { registerSemanticTokensProvider } from './features/semanticTokensProvider';

import { registerExecuteCommand } from './commands/executeCommand';
import { registerDebugCommands } from './commands/debugCommand';
import { registerCancelExecutionCommand } from './commands/cancelExecution';
import { loadPackageData } from './data/packages'; 
import { CwrapSessionManager, SessionStatus } from './utils/cwrapSession';
import { analysisManager } from './analysis/documentAnalysisManager';

// --- グローバル変数の定義 ---
let sessionManager: CwrapSessionManager;
let asirOutputChannel: vscode.OutputChannel;
// ステータスバーアイテム
let asirModeStatusBarItem: vscode.StatusBarItem;
let asirCancelStatusBarItem: vscode.StatusBarItem;
let executeCodeStatusBarItem: vscode.StatusBarItem;
let startSessionStatusBarItem: vscode.StatusBarItem;
let stopSessionStatusBarItem: vscode.StatusBarItem;
let sessionStatusItem: vscode.StatusBarItem;
let interruptButton: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "risa-enhancers" is now active!');

    // 共通のOutputChannelを作成
    asirOutputChannel = vscode.window.createOutputChannel('Risa/Asir CLI Output');
    context.subscriptions.push(asirOutputChannel);

    const executorPath = path.join(context.extensionPath, 'bin');
    sessionManager = new CwrapSessionManager(context, executorPath);

    // --- データファイルの読み込み (必要であれば専用モジュールへ) ---
    loadPackageData(context);

    // --- ステータスバーアイテムの初期化と登録  ---
    initializeStatusBarItems(context);
    updateStatusBarItems(sessionManager.status);
     // 通常実行
    executeCodeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    executeCodeStatusBarItem.command = 'risa_enhancers.executeCode';
    executeCodeStatusBarItem.text = '$(play) Execute Risa/Asir';
    executeCodeStatusBarItem.tooltip = 'Execute Risa/Asir code (Webview Output)';
    executeCodeStatusBarItem.hide();
    context.subscriptions.push(executeCodeStatusBarItem);

    // デバッグセッション開始
    startSessionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    startSessionStatusBarItem.command = 'risa_enhancers.startAsirInteractive';
    startSessionStatusBarItem.text = '$(terminal) Start Risa/Asir Debug Session';
    startSessionStatusBarItem.tooltip = 'Start a new Risa/Asir interactive session';
    startSessionStatusBarItem.show();
    context.subscriptions.push(startSessionStatusBarItem);

    // デバッグセッション停止
    stopSessionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98); 
    stopSessionStatusBarItem.command = 'risa_enhancers.stopAsirInteractive';
    stopSessionStatusBarItem.text = '$(debug-stop) Stop Risa/Asir Debug Session';
    stopSessionStatusBarItem.tooltip = 'Stop the current Risa/Asir interactive session';
    stopSessionStatusBarItem.hide();
    context.subscriptions.push(stopSessionStatusBarItem);

    // 計算キャンセル
    asirCancelStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99); 
    asirCancelStatusBarItem.command = 'risa_enhancers.cancelExecution';
    asirCancelStatusBarItem.text = '$(stop) Cancel Risa/Asir';
    asirCancelStatusBarItem.tooltip = 'Click to cancel current Risa/Asir execution';
    asirCancelStatusBarItem.hide();
    context.subscriptions.push(asirCancelStatusBarItem);

    // WSL/Windows モード切り替えボタン
    asirModeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    asirModeStatusBarItem.command = 'risa_enhancers.switchExecutionMode';
    context.subscriptions.push(asirModeStatusBarItem);
    updateStatusBarMode(context); // 初期設定

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('risaasirExecutor.useWslFromWindows')) {
            updateStatusBarMode(context);
        }
    }));

    // --- 各機能の初期化と登録 ---

    startAnalysis(context);

    registerPackageCompletionProvider(context); 
    registerWordCompletionProvider(context);
    registerExecuteCommand(context, asirOutputChannel, () => sessionManager);
    registerDebugCommands(context, asirOutputChannel, startSessionStatusBarItem, stopSessionStatusBarItem);
    registerCancelExecutionCommand(context, asirOutputChannel, asirCancelStatusBarItem);
    registerHoverProvider(context);
    registerDefinitionProvider(context);
    registerFormattingProvider(context);
    registerRenameProvider(context);
    registerDocumentSymbolProvider(context);
    registerSemanticTokensProvider(context);

    // HelloWorld コマンド
    let disposableHelloWorld = vscode.commands.registerCommand('risa-enhancers.helloWorld', () => {
        vscode.window.showInformationMessage('Hello VS Code from Risa Enhancers!');
    });
    context.subscriptions.push(disposableHelloWorld);

    // 実行モードを切り替えるコマンド 
    let disposableToggleMode = vscode.commands.registerCommand('risa_enhancers.switchExecutionMode', async () => {
        const config = vscode.workspace.getConfiguration('risaasirExecutor', null);
        const currentModeIsWsl = config.get<boolean>('useWslFromWindows', false);
        const newModeIsWsl = !currentModeIsWsl;

        await config.update('useWslFromWindows', newModeIsWsl, vscode.ConfigurationTarget.Workspace);
        updateStatusBarMode(context); // ステータスバーを更新
        vscode.window.showInformationMessage(`Risa/Asir execution mode switched to: ${newModeIsWsl ? 'WSL' : 'Windows Native'}`);
    });
    context.subscriptions.push(disposableToggleMode);

    // セッションモードを切り替えるコマンド
    context.subscriptions.push(vscode.commands.registerCommand('risa_enhancers.switchSessionMode', async () => {
        const config = vscode.workspace.getConfiguration('risaasirExecutor');
        const currentMode = config.get<boolean>('useSessionMode', false);
        await config.update('useSessionMode', !currentMode, vscode.ConfigurationTarget.Global);
        // onDidChangeConfigurationが自動で後続処理を行う
    }));

    // 計算を中断するコマンド
    context.subscriptions.push(vscode.commands.registerCommand('risa_enhancers.interruptExecution', () => {
        sessionManager.interrupt();
    }));

    // 設定が変更されたらセッションを再起動
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('risaasirExecutor.useSessionMode')) {
            await sessionManager.restart();
        }
    }));

    sessionManager.onDidChangeStatus(updateStatusBarItems);

    // 起動時にセッションモードならセッションを開始
    if (vscode.workspace.getConfiguration('risaasirExecutor').get('useSessionMode')) {
        await sessionManager.start();
    }
}

// UI要素の初期化
function initializeStatusBarItems(context: vscode.ExtensionContext) {
    sessionStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    sessionStatusItem.command = 'risa_enhancers.switchSessionMode';
    context.subscriptions.push(sessionStatusItem);

    interruptButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    interruptButton.command = 'risa_enhancers.interruptExecution';
    interruptButton.text = `$(debug-stop) Interrupt Asir`;
    interruptButton.tooltip = 'Interrupt the current Asir calculation';
    context.subscriptions.push(interruptButton);
}

// UIの状態を更新
function updateStatusBarItems(status: SessionStatus) {
    const useSessionMode = vscode.workspace.getConfiguration('risaasirExecutor').get('useSessionMode');
    sessionStatusItem.command = 'risa_enhancers.switchSessionMode';
    
    if (useSessionMode) {
        switch (status) {
            case 'active':
                sessionStatusItem.text = `$(check) Asir Session: On`;
                sessionStatusItem.tooltip = 'Click to switch to Stateless mode';
                break;
            case 'starting':
                sessionStatusItem.text = `$(sync~spin) Asir Session: Starting...`;
                sessionStatusItem.tooltip = 'Session is starting';
                break;
            case 'failed':
                sessionStatusItem.text = `$(error) Asir Session: Off`;
                sessionStatusItem.tooltip = 'Session mode is on, but failed to start. Click to switch to Stateless mode.';
                break;
            case 'stopped':
            case 'stopping':
                sessionStatusItem.text = `$(circle-slash) Asir Session: Off`;
                sessionStatusItem.tooltip = 'Click to switch to Session mode';
                break;
        }
    } else {
        sessionStatusItem.text = `$(circle-slash) Asir Session: Off`;
        sessionStatusItem.tooltip = 'Click to switch to Session mode';
    }
    sessionStatusItem.show();
    interruptButton.hide(); // 中断ボタンは計算中に表示
}


// --- updateStatusBarMode 関数 ---
async function updateStatusBarMode(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('risaasirExecutor', null);
    const useWsl = config.get<boolean>('useWslFromWindows', false);

    if (process.platform === 'win32') {
        if (!asirModeStatusBarItem) { 
            asirModeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
            asirModeStatusBarItem.command = 'risa_enhancers.switchExecutionMode';
            context.subscriptions.push(asirModeStatusBarItem);
        }
        asirModeStatusBarItem.text = `$(sync) Risa/Asir: ${useWsl ? 'WSL' : 'Windows'}`;
        asirModeStatusBarItem.tooltip = `Click to switch Risa/Asir execution mode to ${useWsl ? 'Windows Native' : 'WSL'}`;
        asirModeStatusBarItem.show();
    } else {
        if (asirModeStatusBarItem) {
            asirModeStatusBarItem.hide();
        }
    }
}

// deactivate 
export function deactivate() {
    analysisManager.dispose();
    if (asirModeStatusBarItem) { asirModeStatusBarItem.dispose(); }
    if (asirCancelStatusBarItem) { asirCancelStatusBarItem.dispose(); }
    if (startSessionStatusBarItem) { startSessionStatusBarItem.dispose(); }
    if (stopSessionStatusBarItem) { stopSessionStatusBarItem.dispose(); }
    if (executeCodeStatusBarItem) { executeCodeStatusBarItem.dispose(); }
    if (sessionManager) { sessionManager.stop(); }

    // 通常実行を終了
    const { currentNormalExecuteProcess } = require('./commands/executeCommand');
    if (currentNormalExecuteProcess) {
        vscode.window.showInformationMessage('Terminating Risa/Asir normal execution on extension deactivation.');
        if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            try { execSync(`taskkill /F /T /PID ${currentNormalExecuteProcess.pid!}`); } catch (e) { console.error(`Failed to force terminate normal execution process: ${e}`); }
        } else {
            currentNormalExecuteProcess.kill('SIGKILL');
        }
    }
    // デバッグターミナルを終了
    const { currentAsirTerminal } = require('./commands/debugCommand');
    if (currentAsirTerminal) { 
        vscode.window.showInformationMessage('Terminating Risa/Asir debug terminal on extension deactivation.');
        currentAsirTerminal.dispose();
    }
}

