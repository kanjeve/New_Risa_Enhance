import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { loadedPackages, ctrlPackages, PackageInfo } from '../data/packages';
import { analysisManager } from '../analysis/documentAnalysisManager';
import { InsertTextFormat } from '@kanji/pasirser';
import * as C from '../constants';

export function registerPackageCompletionProvider(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerCompletionItemProvider('rr', {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
            const linePrefix = document.lineAt(position).text.substring(0, position.character);
            const packageMatch = linePrefix.match(/(load|import|ctrl)\(\s*(["']([^"']*)?)?$/);
            if (!packageMatch) {
                return undefined;
            }

            const functionName = packageMatch[1];
            const typedText = packageMatch[3] || '';
            let targetPackages: PackageInfo[] = [];

            if (functionName === 'load' || functionName === 'import') {
                targetPackages = loadedPackages;
            } else if (functionName === 'ctrl') {
                targetPackages = ctrlPackages;
            } 

            const completionItems: vscode.CompletionItem[] = [];
            targetPackages.forEach(pkg => {
                if (pkg.name.startsWith(typedText)) {
                    const item = new vscode.CompletionItem(pkg.name, vscode.CompletionItemKind.Module);
                    item.detail = pkg.description;

                    if (packageMatch[2] && (packageMatch[2].startsWith('"') || packageMatch[2].startsWith("'"))) {
                        item.insertText = pkg.name;
                    } else {
                        item.insertText = new vscode.SnippetString(`"${pkg.name}"`);
                    }
                    completionItems.push(item);
                }
            });
            return completionItems;
        }
    }, '"', '\'');
    context.subscriptions.push(provider)
}

export function registerSematicCompletionProvider(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerCompletionItemProvider('rr', {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem[]> {

            // 1. 解析サービスの取得
            const service = analysisManager.getService(document.uri);
            if (!service) return [];
            // 2. Pasirser にやらせる
            const semanticItems = service.getCompletions(document.getText(), {
                line: position.line,
                character: position.character
            });
            // 3. VSCode の形式に変換
            return semanticItems.map(item => {
                const vsItem = new vscode.CompletionItem(item.label);
                vsItem.kind = item.kind as unknown as vscode.CompletionItemKind;
                vsItem.detail = item.detail;
                vsItem.documentation = item.documentation;

                if (item.insertText) {
                    if (item.insertTextFormat === InsertTextFormat.Snippet) {
                        vsItem.insertText = new vscode.SnippetString(item.insertText);
                    } else {
                        vsItem.insertText = item.insertText;
                    }
                }
                if (item.additionalTextToInsert) {
                    vsItem.additionalTextEdits = [
                        vscode.TextEdit.insert(new vscode.Position(0,0), item.additionalTextToInsert)
                    ];
                }
                return vsItem;
            });
        }
    }, '\"', '(', '.', ':', '>', '#', "/");
    context.subscriptions.push(provider);
}

export function registerPathCompletionProvider(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerCompletionItemProvider('rr', {
        async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
            const linePrefix = document.lineAt(position).text.substring(0, position.character);

            const pathMatch = linePrefix.match(/(load|import|#include)\s*\(?\s*(["'<])([^"'>]*)$/);
            if (!pathMatch) { return undefined };

            const command = pathMatch[1];
            const delimiter = pathMatch[2];
            const userPath = pathMatch[3];
            const currentDir = path.dirname(document.fileName);

            const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR);
            const systemIncludePaths = config.get<string[]>(C.CONFIG_SYSTEM_INCLUDE_PATHS, []) || [];
            const loadPaths = config.get<string[]>(C.CONFIG_LOAD_PATHS, []) || [];

            const searchRoots: { dir: string, type: string }[] = [];

            if (path.isAbsolute(userPath)) {
                // 絶対パスの場合はルートを考慮しない
            } else {
                if (delimiter === '<' && command === '#include') {
                    systemIncludePaths.forEach(p => searchRoots.push({ dir: p, type: 'System' }));
                } else {
                    searchRoots.push({ dir: currentDir, type: 'Relative' });
                    if (command === 'load' || command === 'import') {
                        loadPaths.forEach(p => searchRoots.push({ dir: p, type: 'LoadPath' }));
                    }
                }
            }

            const items: vscode.CompletionItem[] = [];
            const scanDirectory = async (rootDir: string, typeLabel: string | undefined) => {
                let searchDir: string;
                let searchPrefix: string;
                if (path.isAbsolute(userPath)) {
                    searchDir = path.dirname(userPath);
                    searchPrefix = path.basename(userPath);
                    if (userPath.endsWith('/') || userPath.endsWith('\\')) {
                        searchDir = userPath;
                        searchPrefix = '';
                    }
                } else {
                    const dirPart = path.dirname(userPath);
                    searchDir = path.resolve(rootDir, dirPart);
                    searchPrefix = path.basename(userPath);
                    if (userPath.endsWith('/') || userPath.endsWith('\\')) {
                        searchDir = path.resolve(currentDir, userPath);
                        searchPrefix = '';
                    }
                }

                try {
                    if (!fs.existsSync(searchDir) || !fs.statSync(searchDir).isDirectory()) {
                        return [];
                    }
                    const entries = await fs.promises.readdir(searchDir, { withFileTypes: true});

                    for (const entry of entries) {
                        if (!entry.name.startsWith(searchPrefix)) continue;
                        // どっとファイルは除外
                        if (entry.name.startsWith('.') && !searchPrefix.startsWith('.')) continue;
                        // ディレクトリ、.rr,.text,.hファイルのみを候補にする
                        if (entry.isDirectory() || entry.name.endsWith('.rr') || entry.name.endsWith('.txt') || entry.name.endsWith('.h')) {
                            const item = new vscode.CompletionItem(entry.name);
                            if (entry.isDirectory()) {
                                item.kind = vscode.CompletionItemKind.Folder;
                                item.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger suggestions' };
                            } else {
                                item.kind = vscode.CompletionItemKind.File;
                            }
                            if (typeLabel && typeLabel !== 'Relative') {
                                item.detail = `(${typeLabel}) ${entry.name}`;
                            }
                            item.sortText = entry.isDirectory() ? `0_${entry.name}` :`1_${entry.name}`;
                            items.push(item);
                        }
                    }
                    return items;
                } catch (e) {
                    // エラーは無視
                }
            };
            if (path.isAbsolute(userPath)) {
                await scanDirectory('', undefined);
            } else {
                for (const root of searchRoots) {
                    await scanDirectory(root.dir, root.type);
                }
            }
            return items;
        }
    }, '"', '/', '\\', '<');
    context.subscriptions.push(provider);
}