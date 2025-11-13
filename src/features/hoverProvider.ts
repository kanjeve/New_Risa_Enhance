import * as vscode from 'vscode';
import { analysisManager } from '../analysis/documentAnalysisManager';
import { Position } from '@kanji/pasirser';

export function registerHoverProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('rr', {
        provideHover(document, position, token) {
            const service = analysisManager.getService(document.uri);
            if (!service) { return undefined; }

            const pasirserPosition: Position = {
                line: position.line + 1,
                character: position.character
            };

            const hoverInfo = service.getHoverInfo(document.getText(), pasirserPosition);

            if (hoverInfo && hoverInfo.range) {
                const contents = new vscode.MarkdownString(hoverInfo.contents);

                const range = new vscode.Range(
                    hoverInfo.range.start.line -1,
                    hoverInfo.range.start.character -1,
                    hoverInfo.range.end.line -1,
                    hoverInfo.range.end.character
                );
                return new vscode.Hover(contents,range);
            }
            return undefined;
        }
    }));
}