import * as vscode from 'vscode';
import { analysisManager } from '../analysis/documentAnalysisManager';

export function registerFormattingProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('rr', {
        provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
            const service = analysisManager.getService(document.uri);
            if (!service) { return []; }

            const formattedText = service.formatDocument();

            if (formattedText) {

                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                return [vscode.TextEdit.replace(fullRange, formattedText)];
            }
            return [];
        }
    }));
}