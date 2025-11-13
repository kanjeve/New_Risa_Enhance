import * as vscode from 'vscode';
import { analysisManager } from '../analysis/documentAnalysisManager';
import { Position } from '@kanji/pasirser';

export function registerDefinitionProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('rr', {
        provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location> {

            const service = analysisManager.getService(document.uri);
            if (!service) { return undefined; }

            const pasirserPosition: Position = {
                line: position.line + 1,
                character: position.character
            };
            const definitionLocation = service.getDefinitionLocation(document.getText(), pasirserPosition);

            if (definitionLocation) {
                const targetUri = vscode.Uri.file(definitionLocation.filePath);
                const range = new vscode.Range(
                    definitionLocation.startLine - 1,
                    definitionLocation.startColumn,
                    (definitionLocation.endLine ?? definitionLocation.startLine) - 1,
                    definitionLocation.endColumn ?? definitionLocation.startColumn
                );
                return new vscode.Location(targetUri, range);
            }
            return undefined;
        }
    }));
}