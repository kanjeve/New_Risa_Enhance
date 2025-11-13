import * as fs from 'fs/promises';
import * as path from 'path';
import { ASIR_KEYWORDS } from '@kanji/pasirser';

/**
 * 特殊文字を正規表現用にエスケープする
 */
function escapeRegex(tokens: string[]): string[] {
    return tokens.map(token => 
        token.replace(/[.*+?^${}()|[\\]/g, '\\$&')
    );
}

async function main() {
    console.log('--- Generating a simple and robust tmLanguage file ---');

    const keywords = ASIR_KEYWORDS;
    const operators = [
        "<<", ">>", "::", "++", "--", "+=", "-=", "*=", "/=", "%=", "^=", "->", "==", "!=", "<=", ">=", "<", ">", "&&", "||", "!", "+", "-", "*", "/", "%", "^", "=", "`", "|", "(", ")", "{", "}", "[", "]", "?", ":", ";", "$", "@>=", "@<=", "@>", "@<", "@==", "@=", "@!=", "@!", "@&&", "@&", "@||", "@|", "@impl", "@repl", "@equiv"
    ];

    const tmLanguage = {
        '$schema': 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
        name: 'Asir',
        scopeName: 'source.rr',
        patterns: [
            { "include": "#comments" },
            { "include": "#strings" },
            { "include": "#numbers" },
            { "include": "#constants" },
            { "include": "#punctuation" },
            { "include": "#keywords" },
            { "include": "#preprocessor" },
            { "include": "#variables" },
            { "include": "#functions" },
            { "include": "#operators" }
        ],
        repository: {
            comments: {
                patterns: [
                    { name: "comment.block", begin: "/\\*", end: "\\*/" },
                    { name: "comment.line", match: "//.*$" }
                ]
            },
            strings: {
                name: "string.quoted.double",
                begin: "\"",
                end: "\"",
                patterns: [{ name: "constant.character.escape", match: "\\." }]
            },
            keywords: {
                patterns: [
                    { name: "keyword.control", match: `\\b(${keywords.join('|')})\\b` },
                ]
            },
            preprocessor: {
                patterns: [
                    { name: "keyword.control.preprocessor", match: "(#(if|else|elif|endif|define|include|ifdef|ifndef))\\b" }
                ]
            },
            operators: {
                patterns: [{ name: "keyword.operator", match: escapeRegex(operators).join('|') }] 
            },
            functions: {
                patterns: [
                    { name: "entity.name.function", match: "\\b([a-z_][a-zA-Z0-9_]*)(?=\\s*\\()"}
                ]
            },
            variables: {
                patterns: [
                    { name: "variable.other", match: "\\b[A-Z][a-zA-Z0-9_]*\\b" }
                ]
            },
            numbers: {
                patterns: [{ name: "constant.numeric", match: "\\b\\d+(\\.\\d*)?([eE][+-]?\\d+)?\\b" }]
            },
            constants: {
                patterns: [
                    { name: "constant.language", match: "(@e|@pi|@i|@p|@s|@lex|@glex|@grlex|@true|@false|@void)\\b" },
                    { name: "constant.language", match: "@(?![a-zA-Z0-9_])" }
                ]
            },
            punctuation: {
                patterns: [
                    { "name": "punctuation.separator.delimiter", "match": "[,;:$]" },
                    { "name": "punctuation.bracket.square", "match": "\\[|\\]" },
                    { "name": "punctuation.bracket.curly", "match": "[{}]" },
                    { "name": "punctuation.bracket.parenthesis", "match": "[()]" }
                ]
            }
        }
    };

    const tmLanguagePath = path.join(__dirname, '..', 'syntaxes', 'rr.tmLanguage.json');
    await fs.writeFile(tmLanguagePath, JSON.stringify(tmLanguage, null, 4), 'utf8');
    
    console.log(`Successfully generated tmLanguage file.`);
}

main().catch(error => {
    console.error('An error occurred during tmLanguage generation:', error);
    process.exit(1);
});