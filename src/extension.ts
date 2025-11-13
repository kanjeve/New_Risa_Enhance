import * as vscode from 'vscode';
import * as path from 'path';
import * as C from './constants';

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
import { registerDebugCommands } from './commands/debugCommand';
import { registerSwitchModeCommand, updateStatusBarMode } from './commands/switchModeCommand';
import { registerExecutionCommands } from './commands/executionManager';
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
    executeCodeStatusBarItem.command = C.COMMAND_EXECUTE_CODE;
    executeCodeStatusBarItem.text = '$(play) Execute Risa/Asir';
    executeCodeStatusBarItem.tooltip = 'Execute Risa/Asir code (Webview Output)';
    executeCodeStatusBarItem.hide();
    context.subscriptions.push(executeCodeStatusBarItem);

    // デバッグセッション開始
    startSessionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    startSessionStatusBarItem.command = C.COMMAND_START_ASIR_INTERACTIVE;
    startSessionStatusBarItem.text = '$(terminal) Start Risa/Asir Debug Session';
    startSessionStatusBarItem.tooltip = 'Start a new Risa/Asir interactive session';
    startSessionStatusBarItem.show();
    context.subscriptions.push(startSessionStatusBarItem);

    // デバッグセッション停止
    stopSessionStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    stopSessionStatusBarItem.command = C.COMMAND_STOP_ASIR_INTERACTIVE;
    stopSessionStatusBarItem.text = '$(debug-stop) Stop Risa/Asir Debug Session';
    stopSessionStatusBarItem.tooltip = 'Stop the current Risa/Asir interactive session';
    stopSessionStatusBarItem.hide();
    context.subscriptions.push(stopSessionStatusBarItem);

    // 計算キャンセル
    asirCancelStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    asirCancelStatusBarItem.command = C.COMMAND_CANCEL_EXECUTION;
    asirCancelStatusBarItem.text = '$(stop) Cancel Risa/Asir';
    asirCancelStatusBarItem.tooltip = 'Click to cancel current Risa/Asir execution';
    asirCancelStatusBarItem.hide();
    context.subscriptions.push(asirCancelStatusBarItem);

    // WSL/Windows モード切り替えボタン
    asirModeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(asirModeStatusBarItem);
    updateStatusBarMode(context, asirModeStatusBarItem); // 初期設定

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(`${C.CONFIG_SECTION_EXECUTOR}.${C.CONFIG_USE_WSL}`)) {
            updateStatusBarMode(context, asirModeStatusBarItem);
        }
    }));

    // --- 各機能の初期化と登録 ---

    startAnalysis(context);

    registerPackageCompletionProvider(context);
    registerWordCompletionProvider(context);
    registerExecutionCommands(context, asirOutputChannel, asirCancelStatusBarItem, () => sessionManager);
    registerDebugCommands(context, asirOutputChannel, startSessionStatusBarItem, stopSessionStatusBarItem);
    registerSwitchModeCommand(context, asirModeStatusBarItem);
    registerHoverProvider(context);
    registerDefinitionProvider(context);
    registerFormattingProvider(context);
    registerRenameProvider(context);
    registerDocumentSymbolProvider(context);
    registerSemanticTokensProvider(context);

    // HelloWorld コマンド
    let disposableHelloWorld = vscode.commands.registerCommand(C.COMMAND_HELLO_WORLD, () => {
        vscode.window.showInformationMessage('Hello VS Code from Risa Enhancers!');
    });
    context.subscriptions.push(disposableHelloWorld);

    // セッションモードを切り替えるコマンド
    context.subscriptions.push(vscode.commands.registerCommand(C.COMMAND_SWITCH_SESSION_MODE, async () => {
        const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR);
        const currentMode = config.get<boolean>(C.CONFIG_USE_SESSION_MODE, false);
        await config.update(C.CONFIG_USE_SESSION_MODE, !currentMode, vscode.ConfigurationTarget.Global);
    }));

    // 計算を中断するコマンド
    context.subscriptions.push(vscode.commands.registerCommand(C.COMMAND_INTERRUPT_EXECUTION, () => {
        sessionManager.interrupt();
    }));

    // 設定が変更されたらセッションを再起動
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(`${C.CONFIG_SECTION_EXECUTOR}.${C.CONFIG_USE_SESSION_MODE}`)) {
            await sessionManager.restart();
        }
    }));

    sessionManager.onDidChangeStatus(updateStatusBarItems);

    // 起動時にセッションモードならセッションを開始
    if (vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR).get(C.CONFIG_USE_SESSION_MODE)) {
        await sessionManager.start();
    }
}

// UI要素の初期化
function initializeStatusBarItems(context: vscode.ExtensionContext) {
    sessionStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    sessionStatusItem.command = C.COMMAND_SWITCH_SESSION_MODE;
    context.subscriptions.push(sessionStatusItem);

    interruptButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    interruptButton.command = C.COMMAND_INTERRUPT_EXECUTION;
    interruptButton.text = `$(debug-stop) Interrupt Asir`;
    interruptButton.tooltip = 'Interrupt the current Asir calculation';
    context.subscriptions.push(interruptButton);
}

// UIの状態を更新
function updateStatusBarItems(status: SessionStatus) {
    const useSessionMode = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR).get(C.CONFIG_USE_SESSION_MODE);
    sessionStatusItem.command = C.COMMAND_SWITCH_SESSION_MODE;

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

// deactivate 
export function deactivate() {
    analysisManager.dispose();
    if (asirModeStatusBarItem) { asirModeStatusBarItem.dispose(); }
    if (asirCancelStatusBarItem) { asirCancelStatusBarItem.dispose(); }
    if (startSessionStatusBarItem) { startSessionStatusBarItem.dispose(); }
    if (stopSessionStatusBarItem) { stopSessionStatusBarItem.dispose(); }
    if (executeCodeStatusBarItem) { executeCodeStatusBarItem.dispose(); }
    if (sessionManager) { sessionManager.stop(); }
}