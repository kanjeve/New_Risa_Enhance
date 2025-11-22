import * as vscode from 'vscode';
import { analysisManager } from '../analysis/documentAnalysisManager';
import { Position } from '@kanji/pasirser';

export function registerHoverProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('rr', {
        provideHover(document, position, token) {
            const service = analysisManager.getService(document.uri);
            if (!service) { return undefined; }

            const info = service.getHoverInfo(document.getText(), {
                line: position.line,
                character: position.character
            });
            if (!info) return undefined;

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
    }));
}