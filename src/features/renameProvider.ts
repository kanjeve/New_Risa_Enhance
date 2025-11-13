import * as vscode from 'vscode';
import { analysisManager } from '../analysis/documentAnalysisManager';
import { Position, TextEdit as PasirserTextEdit } from '@kanji/pasirser';

export function registerRenameProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerRenameProvider('rr', {
        provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): vscode.ProviderResult<vscode.WorkspaceEdit> {

            const service = analysisManager.getService(document.uri);
            if (!service) { return undefined; }

            const pasirserPosition: Position = {
                line: position.line + 1,
                character: position.character
            };

            const renameEdits = service.getRenameEdits(document.getText(), pasirserPosition, newName);

            if (renameEdits) {
                const workspaceEdit = new vscode.WorkspaceEdit();

                const vsEdits = renameEdits.map(edit => {
                    const range = new vscode.Range(
                        edit.range.start.line -1,
                        edit.range.start.character,
                        edit.range.end.line - 1,
                        edit.range.end.character
                    );
                    return new vscode.TextEdit(range, edit.newText);
                });
                workspaceEdit.set(document.uri, vsEdits);
                return workspaceEdit;
            }
            return undefined;
        }
    }));
}