import * as vscode from "vscode";
import {
    parseAsirCodeAndBuildAST,
    ASTNode,
    ProgramNode,
    IdentifierNode,
    DefinitionStatementNode,
    AssignmentStatementNode,
    BlockNode,
    FunctionCallNode,
    BinaryOperationNode,
    IfStatementNode,
    ForStatementNode,
    WhileStatementNode,
    ReturnStatementNode,
    BreakStatementNode,
    ContinueStatementNode,
    IndexAccessNode,
    StructStatementNode,
    // Add other AST node types you need to visit explicitly
} from '@kanji/pasirser';
import { ASIR_KEYWORDS, ASIR_BUILTIN_FUNCTIONS } from '../data/builtins';

// --- Symbol Table ---

/**
 * Asirの型を表す型エイリアス。
 * TODO: より詳細な型情報を表現できるように拡張する。
 * 例:
 *  - 関数の型: 引数の型リストと戻り値の型を持つオブジェクト `{ kind: 'function', parameterTypes: AsirType[], returnType: AsirType }`
 *  - 構造体の型: メンバーの情報を保持するオブジェクト `{ kind: 'struct', members: Map<string, Symbol> }`
 *  - 配列の型: 要素の型を持つオブジェクト `{ kind: 'list', elementType: AsirType }`
 */
export type AsirType = 'number' | 'polynomial' | 'list' | 'string' | 'function' | 'struct' | 'module' | 'parameter' | 'any' | 'variable' | 'undefined';

/** シンボル情報を格納するインターフェース */
export interface Symbol {
    name: string;
    type: AsirType;
    definedAt: { line: number; column: number };
    node: ASTNode; // このシンボルが定義されたASTノード
    // TODO: 関数の場合は引数の情報、構造体の場合はメンバーの情報を追加する
    // parameters?: Symbol[];
    // returnType?: AsirType;
}

/** スコープを表すクラス */
export class Scope {
    private symbols: Map<string, Symbol> = new Map();
    public readonly parent: Scope | null;
    public readonly node: ASTNode; // このスコープに対応するASTノード

    constructor(node: ASTNode, parent: Scope | null = null) {
        this.node = node;
        this.parent = parent;
    }

    /** 現在のスコープにシンボルを定義する */
    public define(symbol: Symbol): boolean {
        if (this.symbols.has(symbol.name)) {
            return false; // 再定義
        }
        this.symbols.set(symbol.name, symbol);
        return true;
    }

    /** 現在のスコープから親スコープをたどってシンボルを検索する */
    public lookup(name: string): Symbol | undefined {
        let scope: Scope | null = this;
        while (scope) {
            const symbol = scope.symbols.get(name);
            if (symbol) {
                return symbol;
            }
            scope = scope.parent;
        }
        return undefined;
    }

    /** 現在のスコープ内のみでシンボルを検索する */
    public lookupCurrentScope(name: string): Symbol | undefined {
        return this.symbols.get(name);
    }
}

/** シンボルテーブル全体を管理するクラス */
export class SymbolTable {
    public currentScope: Scope;

    constructor(programNode: ProgramNode) {
        this.currentScope = new Scope(programNode);
    }

    public enterScope(node: ASTNode): void {
        this.currentScope = new Scope(node, this.currentScope);
    }

    public exitScope(): void {
        if (this.currentScope.parent) {
            this.currentScope = this.currentScope.parent;
        }
    }
}

// --- ASTを走査して意味解析を行うクラス ---

class SemanticAnalyzer {
    private diagnostics: vscode.Diagnostic[] = [];
    private symbolTable: SymbolTable;

    // --- 解析状態の管理 ---
    // TODO: 現在解析中の関数の情報を保持する。これにより、return文の型チェックなどが可能になる
    private currentFunction: DefinitionStatementNode | null = null;
    // TODO: 現在ループ内にいるかどうかのフラグ。break/continueが正しく使われているかチェックするために使用する
    private isInLoop: boolean = false;


    constructor(programNode: ProgramNode) {
        this.symbolTable = new SymbolTable(programNode);
    }

    /**
     * 解析を実行し、収集した診断情報を返す
     * @param node 解析を開始するルートASTノード
     */
    public analyze(node: ProgramNode): vscode.Diagnostic[] {
        this.visit(node);
        return this.diagnostics;
    }

    /**
     * ASTノードの種類に応じて、適切なvisitメソッドを呼び出すディスパッチャ
     * @param node 訪問するASTノード
     * @returns ノードの型や評価結果など、解析結果を返す（ここでは主に型情報を想定）
     */
    private visit(node: ASTNode | undefined): AsirType {
        if (!node) return 'undefined';

        // TODO: 未実装のASTノードに対応するcaseを追加していく
        switch (node.kind) {
            case 'Program':
                this.visitProgram(node as ProgramNode);
                return 'undefined';
            case 'Block':
                this.visitBlock(node as BlockNode);
                return 'undefined';
            case 'FunctionDefinition':
                this.visitFunctionDefinition(node as DefinitionStatementNode);
                return 'undefined';
            case 'AssignmentStatement':
                return this.visitAssignmentStatement(node as AssignmentStatementNode);
            case 'FunctionCall':
                return this.visitFunctionCall(node as FunctionCallNode);
            case 'Identifier':
                return this.visitIdentifier(node as IdentifierNode);
            
            // --- 以下、実装を追加すべきノードの例 ---
            case 'IfStatement':
                this.visitIfStatement(node as IfStatementNode);
                return 'undefined';
            case 'ForStatement':
                this.visitForStatement(node as ForStatementNode);
                return 'undefined';
            case 'WhileStatement':
                this.visitWhileStatement(node as WhileStatementNode);
                return 'undefined';
            case 'ReturnStatement':
                this.visitReturnStatement(node as ReturnStatementNode);
                return 'undefined';
            case 'BreakStatement':
                this.visitBreakStatement(node as BreakStatementNode);
                return 'undefined';
            case 'ContinueStatement':
                this.visitContinueStatement(node as ContinueStatementNode);
                return 'undefined';
            case 'BinaryOperation':
                return this.visitBinaryOperation(node as BinaryOperationNode);
            case 'IndexAccess':
                return this.visitIndexAccess(node as IndexAccessNode);
            case 'StructStatement':
                this.visitStructStatement(node as StructStatementNode);
                return 'undefined';

            default:
                this.visitChildren(node);
                return 'any'; // 未知のノードはとりあえず 'any' 型としておく
        }
    }

    private visitProgram(node: ProgramNode): void {
        this.visitChildren(node);
    }

    private visitBlock(node: BlockNode): void {
        // ブロックに入る -> 新しいスコープに入る
        this.symbolTable.enterScope(node);
        this.visitChildren(node);
        // ブロックから出る -> スコープを抜ける
        this.symbolTable.exitScope();
    }

    private visitFunctionDefinition(node: DefinitionStatementNode): void {
        if (!node.name) {
            this.addDiagnostic(node, `Malformed AST: Function definition node has no name.`, vscode.DiagnosticSeverity.Error);
            return;
        }
        const funcName = node.name.name;

        // 命名規則チェック: 関数名は小文字で始まるべき
        if (funcName.match(/^[A-Z]/)) {
            this.addDiagnostic(node.name, `Function name '${funcName}' must start with a lowercase letter.`, vscode.DiagnosticSeverity.Error);
        }

        // シンボルの重複定義チェック
        const existing = this.symbolTable.currentScope.lookupCurrentScope(funcName);
        if (existing) {
            this.addDiagnostic(node.name, `Symbol '${funcName}' is already defined in this scope (line ${existing.definedAt.line}).`, vscode.DiagnosticSeverity.Error);
        } else {
            // シンボルテーブルに関数を登録
            this.symbolTable.currentScope.define({
                name: funcName,
                type: 'function',
                definedAt: { line: node.loc!.startLine, column: node.loc!.startColumn },
                node: node
                // TODO: ここで関数の詳細な型情報（引数、戻り値）を登録する
            });
        }

        // --- 関数の内部の解析 ---
        this.currentFunction = node; // 現在の関数を設定
        this.symbolTable.enterScope(node); // 関数スコープに入る

        // 仮引数を現在のスコープに登録
        for (const param of node.parameters) {
            if (!param.name) {
                this.addDiagnostic(param, `Malformed AST: Function parameter node has no name.`, vscode.DiagnosticSeverity.Error);
                continue; // Skip this parameter
            }
            // 命名規則チェック: 仮引数（変数）は英大文字で始まるべき
            if (param.name.match(/^[a-z]/)) {
                this.addDiagnostic(param, `Variable name (parameter) '${param.name}' must start with an uppercase letter.`, vscode.DiagnosticSeverity.Error);
            }
            this.symbolTable.currentScope.define({
                name: param.name,
                type: 'parameter', // 'parameter' 型として区別
                definedAt: { line: param.loc!.startLine, column: param.loc!.startColumn },
                node: param
            });
        }

        // 関数本体を解析
        this.visit(node.body);

        this.symbolTable.exitScope(); // 関数スコープを抜ける
        this.currentFunction = null; // 現在の関数をリセット
    }

    private visitAssignmentStatement(node: AssignmentStatementNode): AsirType {
        // 右辺の式を解析し、型を取得する
        const rightType = this.visit(node.right);

        // 左辺が識別子の場合
        if (node.left.kind === 'Identifier') {
            if (!node.left.name) {
                this.addDiagnostic(node.left, `Malformed AST: Assignment left-hand side identifier has no name.`, vscode.DiagnosticSeverity.Error);
                return 'undefined';
            }
            const varName = node.left.name;
            // 命名規則チェック: 変数名は英大文字で始まるべき
            if (varName.match(/^[a-z]/)) {
                this.addDiagnostic(node.left, `Variable name '${varName}' must start with an uppercase letter.`, vscode.DiagnosticSeverity.Error);
            }
            
            const symbol = this.symbolTable.currentScope.lookup(varName);
            if (!symbol) {
                // シンボルが存在しない場合、新しいシンボルとして定義（暗黙的な変数宣言）
                this.symbolTable.currentScope.define({
                    name: varName,
                    type: rightType, // 右辺の型で型を決定
                    definedAt: { line: node.left.loc!.startLine, column: node.left.loc!.startColumn },
                    node: node.left
                });
            } else {
                // TODO: 型チェック: シンボルが既に存在する場合、代入が可能か型をチェックする
                // if (symbol.type !== 'any' && rightType !== 'any' && symbol.type !== rightType) {
                //     this.addDiagnostic(node, `Type mismatch: Cannot assign type '${rightType}' to a variable of type '${symbol.type}'.`, vscode.DiagnosticSeverity.Error);
                // }
                // symbol.type = rightType; // 型を更新
            }
        } else {
            // TODO: 左辺が `IndexAccess` や `StructMemberAccess` の場合も考慮する
            this.visit(node.left);
        }
        return rightType;
    }

    private visitIdentifier(node: IdentifierNode): AsirType {
        if (!node.name) {
            this.addDiagnostic(node, `Malformed AST: Identifier node has no name.`, vscode.DiagnosticSeverity.Error);
            return 'undefined';
        }
        const symbol = this.symbolTable.currentScope.lookup(node.name);
        if (!symbol) {
            // Risa/Asirの組み込み関数やキーワードはエラーとしない
            const knownBuiltins = [...ASIR_KEYWORDS, ...ASIR_BUILTIN_FUNCTIONS];
            if (!knownBuiltins.includes(node.name)) {
                this.addDiagnostic(node, `Undefined symbol: '${node.name}'`, vscode.DiagnosticSeverity.Warning);
            }
            return 'undefined';
        }
        // TODO: 変数参照の場合、命名規則をチェックする (小文字で始まっていたらエラー)
        // if (symbol.type === 'variable' && node.name.match(/^[a-z]/)) { ... }
        return symbol.type;
    }

    private visitFunctionCall(node: FunctionCallNode): AsirType {
        if (!node.callee || !node.callee.name) {
            this.addDiagnostic(node, `Malformed AST: Function call node has no callee or callee name.`, vscode.DiagnosticSeverity.Error);
            return 'undefined';
        }
        const funcName = node.callee.name;
        const symbol = this.symbolTable.currentScope.lookup(funcName);

        if (symbol) {
            // 呼び出されているシンボルが本当に関数かチェック
            if (symbol.type !== 'function') {
                this.addDiagnostic(node.callee, `'${funcName}' is not a function but is being called as one.`, vscode.DiagnosticSeverity.Error);
            }
            // TODO: 引数の数と型のチェック
            // const expectedArgCount = symbol.parameters?.length ?? 0;
            // if (node.args.length !== expectedArgCount) {
            //     this.addDiagnostic(node, `Expected ${expectedArgCount} arguments, but got ${node.args.length}.`, vscode.DiagnosticSeverity.Error);
            // }
            // node.args.forEach((arg, index) => {
            //     const argType = this.visit(arg);
            //     const expectedType = symbol.parameters?.[index]?.type;
            //     if (expectedType && argType !== 'any' && expectedType !== 'any' && argType !== expectedType) {
            //         this.addDiagnostic(arg, `Type mismatch for argument ${index + 1}. Expected '${expectedType}', but got '${argType}'.`, vscode.DiagnosticSeverity.Error);
            //     }
            // });
        }
        
        // 各引数の式自体も解析
        this.visitChildren(node);

        // TODO: 関数の戻り値の型を返すようにする
        // return symbol?.returnType ?? 'any';
        return 'any';
    }

    // --- 以下に、他のvisitメソッドの実装を追加していく ---

    private visitIfStatement(node: IfStatementNode): void {
        // TODO: 条件式の型チェック
        // const conditionType = this.visit(node.condition);
        // if (conditionType !== 'number' && conditionType !== 'polynomial' && conditionType !== 'any') {
        //     this.addDiagnostic(node.condition, 'If condition must be a numeric or boolean-like expression.', vscode.DiagnosticSeverity.Error);
        // }
        this.visit(node.consequence);
        if (node.alternative) {
            this.visit(node.alternative);
        }
    }

    private visitForStatement(node: ForStatementNode): void {
        this.symbolTable.enterScope(node);
        this.isInLoop = true;

        // TODO: 初期化式、条件式、更新式の解析
        node.initializers.forEach(init => this.visit(init));
        node.conditions.forEach(cond => this.visit(cond));
        node.updaters.forEach(upd => this.visit(upd));
        
        this.visit(node.body);

        this.isInLoop = false;
        this.symbolTable.exitScope();
    }

    private visitWhileStatement(node: WhileStatementNode): void {
        this.isInLoop = true;
        // TODO: 条件式の解析
        this.visit(node.condition);
        this.visit(node.body);
        this.isInLoop = false;
    }

    private visitReturnStatement(node: ReturnStatementNode): void {
        if (!this.currentFunction) {
            this.addDiagnostic(node, '`return` statement can only be used inside a function.', vscode.DiagnosticSeverity.Error);
            return;
        }
        // TODO: 関数の戻り値の型と、return文の値の型が一致するかチェック
        // const returnType = node.value ? this.visit(node.value) : 'void';
        // const expectedReturnType = this.currentFunction.returnType ?? 'void'; // 仮
        // if (returnType !== expectedReturnType) { ... }
    }

    private visitBreakStatement(node: BreakStatementNode): void {
        if (!this.isInLoop) {
            this.addDiagnostic(node, '`break` statement can only be used inside a loop.', vscode.DiagnosticSeverity.Error);
        }
    }

    private visitContinueStatement(node: ContinueStatementNode): void {
        if (!this.isInLoop) {
            this.addDiagnostic(node, '`continue` statement can only be used inside a loop.', vscode.DiagnosticSeverity.Error);
        }
    }

    private visitBinaryOperation(node: BinaryOperationNode): AsirType {
        const leftType = this.visit(node.left);
        const rightType = this.visit(node.right);

        // TODO: 演算子に基づいた型チェック
        // 例: `+`, `-`, `*` などは数値や多項式に適用可能
        // if (leftType !== 'number' || rightType !== 'number') {
        //     this.addDiagnostic(node, `Operator '${node.operator}' cannot be applied to types '${leftType}' and '${rightType}'.`, vscode.DiagnosticSeverity.Error);
        // }
        
        // TODO: 演算結果の型を返す
        // if (leftType === 'polynomial' || rightType === 'polynomial') return 'polynomial';
        return 'number'; // 仮
    }

    private visitIndexAccess(node: IndexAccessNode): AsirType {
        const baseType = this.visit(node.base);
        // TODO: ベースがリスト型かチェック
        // if (baseType !== 'list' && baseType !== 'any') {
        //     this.addDiagnostic(node.base, 'Index access is only allowed on lists.', vscode.DiagnosticSeverity.Error);
        // }

        // TODO: 添字が数値型かチェック
        node.indices.forEach(index => {
            const indexType = this.visit(index);
            // if (indexType !== 'number' && indexType !== 'any') {
            //     this.addDiagnostic(index, 'Array index must be a number.', vscode.DiagnosticSeverity.Error);
            // }
        });

        // TODO: リストの要素の型を返す
        return 'any';
    }

    private visitStructStatement(node: StructStatementNode): void {
        // TODO: 構造体定義をシンボルテーブルに登録する
        // const structName = node.name.name;
        // const members = new Map<string, Symbol>();
        // node.members.forEach(member => { ... });
        // this.symbolTable.currentScope.define({
        //     name: structName,
        //     type: { kind: 'struct', members: members },
        //     ...
        // });
    }


    /**
     * ASTノードの子を再帰的に訪問するヘルパーメソッド
     * @param node 親となるASTノード
     */
    private visitChildren(node: ASTNode): void {
        for (const key in node) {
            // 'loc'や'kind'などのメタ情報はスキップ
            if (key === 'loc' || key === 'kind' || key === 'parent') continue;
            
            const value = (node as any)[key];
            if (Array.isArray(value)) {
                // 子が配列の場合
                for (const child of value) {
                    if (child && typeof child === 'object' && 'kind' in child) {
                        this.visit(child);
                    }
                }
            } else if (value && typeof value === 'object' && 'kind' in value) {
                // 子が単一のオブジェクトの場合
                this.visit(value);
            }
        }
    }

    /**
     * 診断情報を追加するヘルパーメソッド
     * @param node エラーや警告が発生したASTノード
     * @param message 表示するメッセージ
     * @param severity 深刻度 (Error, Warning, etc.)
     */
    private addDiagnostic(node: ASTNode, message: string, severity: vscode.DiagnosticSeverity) {
        if (node.loc) {
            const range = new vscode.Range(
                node.loc.startLine - 1,
                node.loc.startColumn,
                (node.loc.endLine ?? node.loc.startLine) - 1,
                (node.loc.endColumn ?? node.loc.startColumn + 1)
            );
            this.diagnostics.push(new vscode.Diagnostic(range, message, severity));
        }
    }
}

/**
 * ASTを使用してドキュメントを解析し、診断情報を生成する
 * @param document 解析対象のVS Codeドキュメント
 * @returns 診断情報の配列
 */
export function analyzeDocumentWithAST(document: vscode.TextDocument): vscode.Diagnostic[] {
    const code = document.getText();
    console.log("Parsing code from: ", document.uri.fsPath);
    console.log("Code content (first 100 chars): ", code.substring(0, 100));
    const { ast, errors } = parseAsirCodeAndBuildAST(code);

    // パースが成功し、ルートがProgramNodeであることを確認
    if (ast && ast.kind === 'Program') {
        // 型アサーションを使用して、`ast`がProgramNodeであることをコンパイラに明示的に伝える
        const analyzer = new SemanticAnalyzer(ast as ProgramNode);
        return analyzer.analyze(ast as ProgramNode);
    }

    // パースが失敗した場合やルートがProgramNodeでない場合は、このアナライザからは診断情報を返さない
    return [];
}
