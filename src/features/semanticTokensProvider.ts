import * as vscode from 'vscode';
import { analysisManager, DocumentAnalysisManager } from '../analysis/documentAnalysisManager';
import { SemanticToken as PasirserSematicToken, SemanticTokenTypes, SemanticTokenModifiers} from '@kanji/pasirser';
import * as C from '../constants';


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
    'builtinFunction_keyword',
    'formFunction',
    'builtinFunction_default',
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

export function registerSemanticTokensUpdater(context: vscode.ExtensionContext, analysisManager: DocumentAnalysisManager) {
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'rr') {
            const service = analysisManager.getService(event.document.uri);
            const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR);
            const systemIncludePaths = config.get<string[]>(C.CONFIG_SYSTEM_INCLUDE_PATHS, []);
            const loadPaths = config.get<string[]>(C.CONFIG_LOAD_PATHS, []);

            if (service) {
                service.updateDocument(event.document.getText(), systemIncludePaths, loadPaths);
            }
            vscode.languages.setTextDocumentLanguage(event.document, 'rr');
        };
    }));
}