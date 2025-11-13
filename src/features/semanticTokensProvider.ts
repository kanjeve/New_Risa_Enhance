import * as vscode from 'vscode';
import { analysisManager } from '../analysis/documentAnalysisManager';
import { SemanticToken as PasirserSematicToken, SemanticTokenTypes, SemanticTokenModifiers} from '@kanji/pasirser';


const tokenTypes = [
    'struct',
    'module',
    'parameter',
    'variable',
    'property',
    'function',
    'macro',
    'keyword',
    'comment',
    'string',
    'number',
    'operator',
];
const tokenModifiers = [
    'declaration', 'definition', 'readonly', 'static', 'documentation',
];

const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

export function registerSemanticTokensProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider('rr', {
        provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult  <vscode.SemanticTokens> {

            const service = analysisManager.getService(document.uri);
            if (!service) { return new vscode.SemanticTokens(new Uint32Array()); }

        const tokens = service.getSemanticTokens();
        const builder = new vscode.SemanticTokensBuilder(legend);

        tokens.sort((a,b) => {
            if (a.line !== b.line) {
                return a.line -b.line;
            }
            return a.character - b.character;
        });

        tokens.forEach(token => {
            builder.push(
                token.line -1,
                token.character,
                token.length,
                token.tokenType,
                token.tokenModifiers
            );
        });
        return builder.build();
        }
    }, 
    legend ));
}