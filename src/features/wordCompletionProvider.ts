import * as vscode from 'vscode';
import { analysisManager } from '../analysis/documentAnalysisManager';
import { Position, CompletionItem as PasirserCompletionItem, CompletionItemKind as PasirserCompletionItemKind, InsertTextFormat as PasirserInsertTextFormat } from '@kanji/pasirser'; 

// --- ヘルパー関数 ---
function toVscodeCompletionItemKind(kind: PasirserCompletionItemKind): vscode.CompletionItemKind {
    return kind as number;
}

// --- メイン関数 ---
export function registerWordCompletionProvider(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerCompletionItemProvider('rr', {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
            const service = analysisManager.getService(document.uri);
            if (!service) { return []; }

            const code = document.getText();
            const pasirserPosition: Position = {
                line: position.line + 1,
                character: position.character
            };
            const pasirserCompletions = service.getCompletions(code, pasirserPosition);
            
            return pasirserCompletions.map((item: PasirserCompletionItem) => {
                const completionItem = new vscode.CompletionItem(item.label, toVscodeCompletionItemKind(item.kind));
                completionItem.detail = item.detail;
                completionItem.documentation = item.documentation ? new vscode.MarkdownString(item.documentation) : undefined;

                if (item.insertText && item.insertTextFormat === PasirserInsertTextFormat.Snippet) {
                    completionItem.insertText = new vscode.SnippetString(item.insertText);
                } else {
                    completionItem.insertText = item.insertText;
                }
                return completionItem;
            });
        }
    },  
    '(', // pari
    '"'  // ctrl
    );
    context.subscriptions.push(provider);
}