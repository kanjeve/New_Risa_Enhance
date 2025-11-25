import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as C from '../constants';
import { analysisManager } from '../analysis/documentAnalysisManager';

export function registerHoverProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('rr', {
        async provideHover(document, position, token) {
            // pasirser　による意味解析
            const service = analysisManager.getService(document.uri);
            if (service) {
                const info = service.getHoverInfo(document.getText(), {
                    line: position.line,
                    character: position.character
                });
                if (info) {
                    const contents = info.contents.map(c => {
                        const md = new vscode.MarkdownString(c);
                        md.isTrusted = true; // 必要に応じて
                        return md;
                    });

                    let range: vscode.Range | undefined;
                    if (info.range) {
                        range = new vscode.Range(
                            info.range.start.line, info.range.start.character,
                            info.range.end.line, info.range.end.character
                        );
                    }
                    return new vscode.Hover(contents,range);
                }
            }
            return await provideFileSummaryhover(document, position);
        }
    }));
}

/**
 * load/include されたファイルの概要表示
 */
async function provideFileSummaryhover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    const lineText = document.lineAt(position.line).text;
    const match = lineText.match(/(load|import|#include)\s*\(?\s*(["'<])([^"'>]*)(["'>])?/);

    if (!match) return undefined;

    const delimiter = match[2];
    const filePath = match[3];

    const pathIndex = lineText.indexOf(filePath);
    if (position.character < pathIndex || position.character > pathIndex + filePath.length) {
        return undefined;
    }

    const currentDir = path.dirname(document.fileName);
    const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR);
    const systemIncludePaths = config.get<string[]>(C.CONFIG_SYSTEM_INCLUDE_PATHS, []) || [];
    const loadPaths = config.get<string[]>(C.CONFIG_LOAD_PATHS, []) || [];

    let resolvedPath: string | null = null;

    if (path.isAbsolute(filePath)) {
        if (fs.existsSync(filePath)) resolvedPath = filePath;
    } else {
        const searchPaths: string[] = [];
        if (delimiter === '<') {
            searchPaths.push(...systemIncludePaths);
        } else {
            searchPaths.push(currentDir);
            searchPaths.push(...loadPaths);
        }

        for (const dir of searchPaths) {
            const testPath = path.resolve(dir, filePath);
            if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
                resolvedPath = testPath;
                break;
            }
        }
    }

    if (!resolvedPath) return undefined;

    try {
        const content = await fs.promises.readFile(resolvedPath, 'utf-8');
        const lines = content.split('\n');

        const dependencies: string[] = [];
        const globalFunctions: string[] = [];
        const moduleMap = new Map<string, string[]>();
        const structs: string[] = [];
        const macros: string[] = [];

        let currentModule: string | null = null;

        for (const line of lines) {
            const trimLine = line.trim();
            if (trimLine.startsWith('//') || trimLine.startsWith('/*')) continue;

            let m;
            // 依存関係 (load, #include 等) の抽出
            if ((m = trimLine.match(/^(load|import|#include)\s*\(?\s*["'<]([^"'>]+)/))) {
                dependencies.push(m[2]);
                continue;
            }
            if ((m = trimLine.match(/^module\s+([a-zA-Z0-9_]+)/))) {
                currentModule = m[1];
                if (!moduleMap.has(currentModule)) {
                    moduleMap.set(currentModule, []);
                }
                continue;
            }
            if (trimLine.match(/^endmodule/)) {
                currentModule = null;
                continue;
            }
            if ((m = trimLine.match(/^def\s+([a-zA-Z0-9_]+)/))) {
                const funcName = m[1];
                if (currentModule) {
                    moduleMap.get(currentModule)?.push(funcName);
                } else {
                    globalFunctions.push(funcName);
                }
                continue;
            }
            if ((m = trimLine.match(/^struct\s+([a-zA-Z0-9_]+)/))) {
                structs.push(m[1]);
                continue;
            }
            if ((m = trimLine.match(/^#define\s+([a-zA-Z0-9_]+)/))) {
                macros.push(m[1]);
                continue;
            }
        }

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**File:** \`${path.basename(resolvedPath)}\`\n\n`);

        if (dependencies.length > 0) {
            md.appendMarkdown(`**Dependencies:** \`${dependencies.join('`, `')}\`\n\n`);
        }

        md.appendMarkdown(`---\n`);

        let hasContent = false;

        if (globalFunctions.length > 0) {
            md.appendMarkdown(`**Functions:** \`${globalFunctions.join(', ')}\`\n\n`);
            hasContent = true;
        }

        if (moduleMap.size > 0) {
            moduleMap.forEach((funcs, modName) => {
                md.appendMarkdown(`**Module ${modName}:** \`${funcs.join(', ')}\`\n\n`);
            });
            hasContent = true;
        }

        if (structs.length > 0) {
            md.appendMarkdown(`**Structs:** \`${structs.join(', ')}\`\n\n`);
            hasContent = true;
        }

        if (macros.length > 0) {
            md.appendMarkdown(`**Macros:** \`${macros.join(', ')}\`\n\n`);
            hasContent = true;
        }

        if (!hasContent && dependencies.length === 0) {
            md.appendMarkdown(`*(No definitions found)*`);
        }

        return new vscode.Hover(md);
    } catch (e) {
        return undefined;
    }
}