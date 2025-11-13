import * as vscode from 'vscode';
import * as C from '../constants';

/**
 * ステータスバーの実行モード表示を更新します。
 * @param context 拡張機能のコンテキスト
 * @param asirModeStatusBarItem 更新対象のステータスバーアイテム
 */
export async function updateStatusBarMode(context: vscode.ExtensionContext, asirModeStatusBarItem: vscode.StatusBarItem) {
    const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR, null);
    const useWsl = config.get<boolean>(C.CONFIG_USE_WSL, false);

    if (process.platform === 'win32') {
        asirModeStatusBarItem.command = C.COMMAND_SWITCH_EXECUTION_MODE;
        asirModeStatusBarItem.text = `$(sync) Risa/Asir: ${useWsl ? 'WSL' : 'Windows'}`;
        asirModeStatusBarItem.tooltip = `Click to switch Risa/Asir execution mode to ${useWsl ? 'Windows Native' : 'WSL'}`;
        asirModeStatusBarItem.show();
    } else {
        asirModeStatusBarItem.hide();
    }
}

/**
 * 実行モードを切り替えるコマンドを登録します。
 * @param context 拡張機能のコンテキスト
 * @param asirModeStatusBarItem 更新対象のステータスバーアイテム
 */
export function registerSwitchModeCommand(context: vscode.ExtensionContext, asirModeStatusBarItem: vscode.StatusBarItem) {
    let disposableToggleMode = vscode.commands.registerCommand(C.COMMAND_SWITCH_EXECUTION_MODE, async () => {
        const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR, null);
        const currentModeIsWsl = config.get<boolean>(C.CONFIG_USE_WSL, false);
        const newModeIsWsl = !currentModeIsWsl;

        await config.update(C.CONFIG_USE_WSL, newModeIsWsl, vscode.ConfigurationTarget.Workspace);
        updateStatusBarMode(context, asirModeStatusBarItem); // ステータスバーを更新
        vscode.window.showInformationMessage(`Risa/Asir execution mode switched to: ${newModeIsWsl ? 'WSL' : 'Windows Native'}`);
    });
    context.subscriptions.push(disposableToggleMode);
}