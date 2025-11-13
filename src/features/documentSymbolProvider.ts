import * as vscode from 'vscode';
import { analysisManager } from '../analysis/documentAnalysisManager';
import { DocumentSymbol as PasirserDocumentSymbol, SymbolKind as PasirserSymbolKind } from '@kanji/pasirser';

// --- ヘルパー関数 ---
function toVscodeSymbolKind(kind: PasirserSymbolKind): vscode.SymbolKind {
    return kind as number;
}

// --- メイン ---
export function registerDocumentSymbolProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider('rr', {
        provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentSymbol[]> {
            const service = analysisManager.getService(document.uri);
            if (!service) { return []; }
            const symbols = service.getDocumentSymbols();

            const convertToVscodeDocumentSymbol = (pasirserSymbols: PasirserDocumentSymbol[]): vscode.DocumentSymbol[] => {
                return pasirserSymbols.map(s => {
                    const range = new vscode.Range(
                        s.range.start.line - 1,
                        s.range.start.character,
                        s.range.end.line - 1,
                        s.range.end.character
                    );
                    const selectionRange = new vscode.Range(
                        s.selectionRange.start.line - 1,
                        s.selectionRange.start.character,
                        s.selectionRange.end.line - 1,
                        s.selectionRange.end.character
                    );
                    const vsSymbol = new vscode.DocumentSymbol(
                        s.name,
                        s.detail || '',
                        toVscodeSymbolKind(s.kind),
                        range,
                        selectionRange
                    );
                    if (s.children) {
                        vsSymbol.children = convertToVscodeDocumentSymbol(s.children);
                    }
                    return vsSymbol;
                });
            };
            return convertToVscodeDocumentSymbol(symbols);
        }
    }));
}