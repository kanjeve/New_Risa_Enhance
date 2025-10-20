import * as vscode from 'vscode';
import { analyze, SymbolTable, Diagnostic as PasirserDiagnostic, DiagnosticSeverity } from '@kanji/pasirser';


let diagnosticCollection: vscode.DiagnosticCollection;
const documentSymbolTables = new Map<string, SymbolTable>();
let debounceTimer: NodeJS.Timeout;

export function registerDiagnostics(context: vscode.ExtensionContext) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('Risa/Asir');
    context.subscriptions.push(diagnosticCollection);

    const triggerDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'rr') {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                updateDiagnostics(document);
            }, 300);
        }
    };
    if (vscode.window.activeTextEditor) { triggerDiagnostics(vscode.window.activeTextEditor.document); }
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => { if (editor) triggerDiagnostics(editor.document); }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => triggerDiagnostics(event.document)));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri)));
}


// pasirserエンジンを呼び出し、エディタの診断機能を更新するメイン関数
function updateDiagnostics(document: vscode.TextDocument) {
    const { diagnostics: PasirserDiagnostic, symbolTable } = analyze(document.getText());
    // pasirserのdiagnosticsをvscodeように変換する
    const vscodeDiagnostics = PasirserDiagnostic.map(d => {
        const range = new vscode.Range(d.range.start.line, d.range.start.character, d.range.end.line, d.range.end.character);
        const severity = d.severity === DiagnosticSeverity.Error
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;
        return new vscode.Diagnostic(range, d.message, severity);
    });
    // 診断結果のセット
    diagnosticCollection.set(document.uri, vscodeDiagnostics);
    // シンボルテーブルを保存
    if (symbolTable) {
        documentSymbolTables.set(document.uri.toString(), symbolTable);
    } else {
        documentSymbolTables.delete(document.uri.toString());
    }
}

export function getSymbolTableForDocument(uri: vscode.Uri): SymbolTable | undefined {
    return documentSymbolTables.get(uri.toString());
}