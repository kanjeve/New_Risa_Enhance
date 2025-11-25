import * as vscode from 'vscode';
import { analysisManager } from './documentAnalysisManager';
import { Diagnostic as PasirserDiagnostic, DiagnosticSeverity, DiagnosticTag } from '@kanji/pasirser';
import * as C from '../constants';

let diagnosticCollection: vscode.DiagnosticCollection;

const updateTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY_MS = 500; // 0.5s

const SEVERITY_LEVEL_MAP: { [key: string]: number } = {
    'Error': 0,
    'Warning': 1,
    'Information': 2,
    'Hint': 3,
    'None': 4 // 'None' の場合は何も表示しない
};

/**
 * ファイルの監視を開始し、変更に応じて解析と診断情報の更新を行う司令塔となる関数。
 * @param context 拡張機能のコンテキスト
 */
export function startAnalysis(context: vscode.ExtensionContext) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('Risa/Asir');
    context.subscriptions.push(diagnosticCollection);

    // すべての言語サービスに現在の意味解析設定を適用し、診断を再実行する
    const updateAllServicesValidation = () => {
        const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_ANALYSIS);
        const semanticValidationEnabled = config.get<boolean>(C.CONFIG_ENABLE_SEMANTIC_VALIDATION, false);

        const services = analysisManager.getAllServices();
        for (const service of services) {
            service.setSemanticValidation(semanticValidationEnabled);
            
            // 対応するドキュメントを見つけて診断を即時更新
            const uriString = analysisManager.getUriForService(service);
            if (uriString) {
                const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uriString);
                if (document) {
                    triggerUpdate(document, 0); // 0msディレイで即時実行
                }
            }
        }
    };
    
    // 起動時に設定を適用
    updateAllServicesValidation();

    // 設定が変更されたら、すべてのサービスに再適用
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(`${C.CONFIG_SECTION_ANALYSIS}.${C.CONFIG_ENABLE_SEMANTIC_VALIDATION}`)) {
                updateAllServicesValidation();
            }
        })
    );

    let debounceTimer: NodeJS.Timeout;

    const triggerUpdate = (document: vscode.TextDocument, debounceTime: number = 300) => {
        if (document.languageId !== 'rr') {
            return;
        }

        const uriString = document.uri.toString();
        if (updateTimers.has(uriString)) {
            const existingTimer = updateTimers.get(uriString);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }
        }

        const timer = setTimeout(() => {
            const service = analysisManager.getService(document.uri);

            // 設定からインクルードパスなどを取得
            const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_EXECUTOR);
            const userIncludePaths = config.get<string[]>('includePaths', []);
            const userLoadPaths = config.get<string[]>('loadPaths', []);

            let workspaceRoot: string | undefined;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                workspaceRoot = workspaceFolder.uri.fsPath;
            }
            const finalLoadPaths = workspaceRoot ? [workspaceRoot, ...userLoadPaths] : userLoadPaths;

            const systemIncludePaths = config.get<string[]>(C.CONFIG_SYSTEM_INCLUDE_PATHS, []) || [];
            const loadPaths = config.get<string[]>(C.CONFIG_LOAD_PATHS, []) || [];
            if (workspaceRoot) finalLoadPaths.unshift(workspaceRoot);

            service.updateDocument(document.getText(), systemIncludePaths, finalLoadPaths);

            updateDiagnostics(document.uri, service.getDiagnostics());
            
            updateTimers.delete(uriString);
        }, DEBOUNCE_DELAY_MS);
        updateTimers.set(uriString, timer);
    };

    // ---- イベントリスナーの登録 ----

    // ファイルが最初に開かれた時
    if (vscode.window.activeTextEditor) {
        triggerUpdate(vscode.window.activeTextEditor.document);
    }

    // ファイルを切り替えた時
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                triggerUpdate(editor.document);
            }
        })
    );

    // ファイルが変更された時
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            triggerUpdate(event.document);
        })
    );

    // ファイルが閉じられた時
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => {
            analysisManager.removeService(doc.uri);
            diagnosticCollection.delete(doc.uri);

            const uriString = doc.uri.toString();
            if (updateTimers.has(uriString)) {
                clearTimeout(updateTimers.get(uriString)!);
                updateTimers.delete(uriString);
            }
        })
    );
}

/**
 * Pasirserの診断情報をVSCodeの形式に変換し、UIを更新する。
 * @param uri 対象ドキュメントのURI
 * @param pasirserDiagnostics Pasirserから受け取った診断情報の配列
 */
function updateDiagnostics(uri: vscode.Uri, pasirserDiagnostics: PasirserDiagnostic[]) {
    const config = vscode.workspace.getConfiguration(C.CONFIG_SECTION_DIAGNOSTICS);
    const minimumSeveritySetting = config.get<string>(C.CONFIG_DIAGNOSTICS_MINIMUM_SEVERITY, 'Hint');
    const minimumSeverityValue = SEVERITY_LEVEL_MAP[minimumSeveritySetting] ?? 3; // デフォルトはHint

    const vscodeDiagnostics = pasirserDiagnostics
        .filter(d => {
            // 'None' が設定されている場合は、すべての診断をフィルタリング
            if (minimumSeverityValue === SEVERITY_LEVEL_MAP['None']) {
                return false;
            }
            // PasirserDiagnostic の severity を数値にマッピング
            const diagnosticSeverityValue = SEVERITY_LEVEL_MAP[DiagnosticSeverity[d.severity]] ?? 3; // PasirserDiagnosticSeverityを文字列に変換して比較

            return diagnosticSeverityValue <= minimumSeverityValue;
        })
        .map(d => {
            const range = new vscode.Range(d.range.start.line - 1, d.range.start.character, d.range.end.line - 1, d.range.end.character);
            let severity: vscode.DiagnosticSeverity;

            switch (d.severity) {
                case DiagnosticSeverity.Error:
                    severity = vscode.DiagnosticSeverity.Error;
                    break;
                case DiagnosticSeverity.Warning:
                    severity = vscode.DiagnosticSeverity.Warning;
                    break;
                case DiagnosticSeverity.Information:
                    severity = vscode.DiagnosticSeverity.Information;
                    break;
                case DiagnosticSeverity.Hint:
                    severity = vscode.DiagnosticSeverity.Hint;
                    break;
                default:
                    severity = vscode.DiagnosticSeverity.Warning;
            }
            const diagnostic = new vscode.Diagnostic(range, d.message, severity);
            diagnostic.source = d.source;

            if (d.tags) {
                diagnostic.tags = d.tags.map(tag => {
                    if (tag === 1) return vscode.DiagnosticTag.Unnecessary;
                    if (tag === 2) return vscode.DiagnosticTag.Deprecated;
                    return vscode.DiagnosticTag.Deprecated;
                })
            }
            return diagnostic;
        });

    diagnosticCollection.set(uri, vscodeDiagnostics);
}