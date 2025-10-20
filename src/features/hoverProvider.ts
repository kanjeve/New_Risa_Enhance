import * as vscode from 'vscode';
import { getSymbolTableForDocument } from './diagnostics';
import { AsirType } from '@kanji/pasirser'


export function typeToString(type: AsirType): string {
    switch (type.kind) {
        case 'primitive':
            return type.name;
        case 'list':
            return `list[${typeToString(type.elementType)}]`;
        case 'function':
            const params = type.parameters.map(p => typeToString(p.type)).join(', ');
            return `function(${params}) -> ${typeToString(type.returnType)}`;
        case 'struct':
            return `struct ${type.name}`;
        case 'module':
            return `module ${type.name}`;
        case 'union':
            return type.types.map(t => typeToString(t)).join(' | ');
        case 'literal_union':
            return type.values.map(v => typeof v === 'string' ? `'${v}'` : v).join(' | ');
        case 'overloaded_function':
            return type.signatures.map(sig => typeToString(sig)).join('\n');
    }
}

export function registerHoverProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('rr', {
        provideHover(document, position, token) {
            const symbolTable = getSymbolTableForDocument(document.uri);
            if (!symbolTable) { return undefined; }

            const range = document.getWordRangeAtPosition(position);
            if (!range) { return undefined; }
            const word = document.getText(range);

            const genericPosition = { line: position.line, character: position.character };
            const scope = symbolTable.findScopeAt(genericPosition);
            const symbol = scope.lookup(word);

            if (symbol) {
                const contents = new vscode.MarkdownString();
                contents.appendCodeblock(typeToString(symbol.type), 'asir'); // 型情報をコードブロックで表示
                if (symbol.definedAt) {
                    contents.appendMarkdown(`\n*${symbol.definedAt.startLine} 行目で定義されています。*`);
                }
                return new vscode.Hover(contents, range);
            }

            return undefined;
        }
    }));
}