import * as vscode from 'vscode';
import { ASIR_BUILTIN_FUNCTIONS, ASIR_KEYWORDS } from '../data/builtins';
import { getSymbolTableForDocument } from './diagnostics';
import { Symbol, Scope } from '@kanji/pasirser'; 

export function registerWordCompletionProvider(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerCompletionItemProvider('rr', {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
            const completionItems: vscode.CompletionItem[] = [];

            const symbolTable = getSymbolTableForDocument(document.uri);
            if (symbolTable) {
                const genericPosition = { line: position.line, character: position.character };
                let currentScope: Scope | null = symbolTable.findScopeAt(genericPosition);
                const visibleSymbols = new Map<string, Symbol>();

                while (currentScope) {
                    currentScope.symbols.forEach((symbol, name) => {
                        if (!visibleSymbols.has(name)) { visibleSymbols.set(name, symbol); }
                    });
                    currentScope = currentScope.parent;
                }

                visibleSymbols.forEach((symbol, name) => {
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
                    if (symbol.type.kind === 'function' || symbol.type.kind === 'overloaded_function') {
                        item.kind = vscode.CompletionItemKind.Function;
                    } else if (symbol.type.kind === 'struct') {
                        item.kind = vscode.CompletionItemKind.Struct;
                    } else if (symbol.type.kind === 'module') {
                        item.kind = vscode.CompletionItemKind.Module;
                    }
                    completionItems.push(item);
                });
            }

            ASIR_BUILTIN_FUNCTIONS.forEach(funcName => {
                completionItems.push(new vscode.CompletionItem(funcName, vscode.CompletionItemKind.Function));
            });
            ASIR_KEYWORDS.forEach(keyword => {
                completionItems.push(new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword));
            });

            return completionItems;
        }
    },  
    '(',
    '.'); // ( と . もトリガーにする。
    context.subscriptions.push(provider);
}