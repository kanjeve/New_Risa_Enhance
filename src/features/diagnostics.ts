import * as vscode from 'vscode';
import { parseAsirCodeAndBuildAST } from '@kanji/pasirser';
import { analyzeDocumentWithAST } from './astSemanticAnalyzer';

// SymbolInfo の型定義 (他の機能と共有するため、ここでエクスポート)
export interface SymbolInfo {
    name: string;
    type: 'variable' | 'function' | 'parameter' | 'module' | 'struct';
    definitionRange?: vscode.Range;
}

// 診断コレクション
let diagnosticCollection: vscode.DiagnosticCollection;

// 定義済みシンボルを保持する Map 
export let currentDefinedSymbols: Map<string, SymbolInfo> = new Map();

/**
 * Risa/Asir 言語のコード診断機能の初期化。
 *
 * @param context 拡張機能のコンテキスト。
 * @param sharedDefinedSymbols 他の機能と共有する定義済みシンボル Map。
 * @param outputChannel デバッグメッセージなどを出力するための OutputChannel。
 */
export function registerDiagnostics(context: vscode.ExtensionContext, sharedDefinedSymbols: Map<string, SymbolInfo>, outputChannel: vscode.OutputChannel) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('risa-enhancers');
    context.subscriptions.push(diagnosticCollection);

    currentDefinedSymbols = sharedDefinedSymbols;

    const triggerDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'rr') {
            updateDiagnosticsWithAST(document, diagnosticCollection);
        }
    };

    vscode.workspace.onDidOpenTextDocument(document => {
        triggerDiagnostics(document);
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        triggerDiagnostics(event.document);
    }, null, context.subscriptions);

    if (vscode.window.activeTextEditor) {
        triggerDiagnostics(vscode.window.activeTextEditor.document);
    }
}


/**
 * ASTとセマンティック解析を用いてコードの診断を行います。
 * @param document 現在のテキストドキュメント。
 * @param diagnosticCollection 診断メッセージを追加するコレクション。
 */
export function updateDiagnosticsWithAST(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection) {
    const text = document.getText();
    let diagnostics: vscode.Diagnostic[] = [];

    // 1. `pasirser`でASTを構築。構文エラー情報も取得する。
    const { ast, errors } = parseAsirCodeAndBuildAST(text);

    // 構文エラーがある場合、それを診断情報として追加
    if (errors.length > 0) {
        for (const error of errors) {
            const range = new vscode.Range(
                error.line - 1, // ANTLR4の行は1ベース、VS Codeの行は0ベース
                error.column,   // ANTLR4の列は0ベース、VS Codeの列も0ベース
                error.line - 1,
                error.column + (error.offendingSymbol ? error.offendingSymbol.length : 1)
            );
            diagnostics.push(new vscode.Diagnostic(
                range,
                `Syntax Error: ${error.message}`,
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    // ASTが正常に構築された場合のみ、セマンティック解析を実行
    if (ast) {
        const semanticDiagnostics = analyzeDocumentWithAST(document);
        diagnostics.push(...semanticDiagnostics);
    }
    
    diagnosticCollection.set(document.uri, diagnostics);
    
    // TODO: `currentDefinedSymbols` の更新ロジックを実装する
    // `analyzeDocumentWithAST` がシンボルテーブルを返すように修正し、
    // ここで `currentDefinedSymbols` を更新するのが望ましい。
}