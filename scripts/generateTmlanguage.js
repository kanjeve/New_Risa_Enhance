const fs = require('fs');
const path = require('path');

const { ASIR_KEYWORDS, ASIR_BUILTIN_FUNCTIONS} = require('../out/builtins.js');

const tmLanguagePath = path.join(__dirname, '..', 'syntaxes', 'rr.tmLanguage.json');

// 既存のtmLanguage.jsonを読み込む
let tmLanguage = {};
try {
    tmLanguage = JSON.parse(fs.readFileSync(tmLanguagePath, 'utf8'));
} catch (e) {
    console.error(`Error reading ${tmLanguagePath}:`, e);
    // ファイルが存在しない場合は、基本構造を初期化
    tmLanguage = {
        "scopeName": "source.rr",
        "fileTypes": ["rr"],
        "patterns": [
            { "include": "#comments" },
            { "include": "#keywords" },
            { "include": "#strings" },
            { "include": "#numbers" },
            { "include": "#operators" },
            { "include": "#built-in-functions" },
            { "include": "#language-constants" },
            { "include": "#types" },
            { "include": "#punctuation" },
            { "include": "#functions" },
            { "include": "#variables" }
        ],
        "repository": {
            "comments": { /* ... */ },
            "strings": { /* ... */ },
            "numbers": { /* ... */ },
            "operators": { /* ... */ },
            "language-constants": { /* ... */ },
            "types": { /* ... */ },
            "punctuation": { /* ... */ },
            "keywords": { "patterns": [] },
            "built-in-functions": { "patterns": [] },
            "functions": { "patterns": [] }, 
            "variables": { "patterns": [] }  
        }
    };
}

// キーワードを更新
tmLanguage.repository.keywords = {
    "patterns": [
        {
            "name": "keyword.control.rr",
            "match": `\\b(${ASIR_KEYWORDS.join('|')})\\b`
        }
    ]
};

// 組み込み関数を更新
const escapedBuiltinFunctions = ASIR_BUILTIN_FUNCTIONS.map(f => f.replace(/[@.]/g, '\\$&'));
tmLanguage.repository['built-in-functions'] = { 
    "patterns": [
        {
            "name": "support.function.builtin.rr",
            "match": `\\b(${escapedBuiltinFunctions.join('|')})\\b`
        }
    ]
};


fs.writeFileSync(tmLanguagePath, JSON.stringify(tmLanguage, null, 4), 'utf8');
console.log('rr.tmLanguage.json updated successfully with data from builtins.ts!');