# Risa_Enhancers

Risa/Asir 言語での計算を支援する VS Code 拡張機能です。
シンタックスハイライト、コード補完、強力な静的解析、そして実行環境を提供します。

## 主な機能

- **シンタックスハイライト**: 視認性の高いコード表示
- **コード補完**: 組み込み関数、キーワード、変数の入力支援
- **定義ジャンプ (F12)**: 関数や変数の定義元へ瞬時に移動
- **ホバー情報**: 変数の型や関数のシグネチャを表示
- **静的解析 (Validator)**: 実行前に構文エラーや型、引数の不一致を検出
- **コード実行**: エディタ上から直接 Risa/Asir を実行し、結果を表示

## 使い方

### 基本的な実行
1. 拡張子 `.rr` のファイルを作成し、コードを記述します。
2. 実行したい行にカーソルを置くか、範囲選択をします。
3. `Shift + Enter` を押すか、右上の `Risa/Asir: Execute Code` (▶アイコン) をクリックします。
4. 結果が専用の出力パネル（またはWebview）に表示されます。

※ 実行できない場合は、設定画面で `Risa/Asir Path` が正しく設定されているか確認してください。

### 実行モードの切り替え (Windows/WSL)
Windows ユーザーの場合、ステータスバー左下の `Risa/Asir: Windows` / `Risa/Asir: WSL` をクリックすることで、実行環境を切り替えられます。
- **Windows**: WSL の起動を介さないため、起動と応答が高速です。
- **WSL**: WSL 環境上の Asir を利用します（OpenXM経由）。~~WSL 環境の構築については `howtowsl.txt` を参照してください。~~

### デバッグ・対話モード
ターミナルを使った対話風な実行も可能です。
- **デバッグ開始**: 関数などを範囲選択し、`Ctrl + Shift + D` (Macは `Cmd + Shift + D`) を押すと、そのコードを読み込んだ状態でデバッグセッションが開始されます。
- **REPL風実行**: コードを選択して `Shift + Enter` を押すと、そのコードがターミナルに送信され、順次実行されます。

### 実行の強制停止
計算時間が長すぎる場合や無限ループに陥った場合は、ステータスバー右下の `Cancel Risa/Asir` (コーヒーカップアイコン ☕) をクリックして停止できます。

## 設定 (Configuration)

高度な機能を利用するために、以下の設定が可能です。

- **`risaasirExecutor.asirPathWindows`**:
  - Windows 利用者向けの Risa/Asir 実行パスです。
  - ※デフォルトは `"C:\\Program Files\\asir\\bin\\asir.exe"` です。お手持ちの環境に合わせて調整してください。

- **`risaasirExecutor.asirPathLinux`**:
  - Linux 利用者向けの Risa/Asir 実行パスです。
  - ※デフォルトは `/usr/local/bin/asir` です。お手持ちの環境に合わせて調整してください。

- **`risaasirExecutor.asirPathMac`**:
  - Mac 利用者向けの Risa/Asir 実行パスです。
  - ※デフォルトは `/usr/local/bin/asir` です。お手持ちの環境に合わせて調整してください。

- **`risaasirExecutor.wslDistribution`**:
  - WSL 実行におけるディストリビューション（ホスト OS ）を設定します。
  - ※デフォルトは `Ubuntu` です。

- **`risaasirExecutor.debugStartupDelay`**:
  - デバッグ実行の際に、セッションの開始からコードの送信までにかかる時間を設定できます。
  - ※デフォルトは 3000 ミリ秒（ 3 秒）です。この時間が長ければ長いほどデバッグセッションの起動に成功しやすいです。

- **`risaasirExecutor.systemIncludePaths`**:
  - `#include <>` で読み取れるパスを設定できます。基本的には `defs.h` が存在するディレクトリが対象となります。
  - ※デフォルトは未定義です。

- **`risaasirExecutor.loadPaths`**:
  - `load()` や `import()` で読み取れるパスを設定できます。 `ctrl("loadpath");` を実行すると得られるパスが対象となります。
  - ※デフォルトは未定義です。

- **`risaasir.analysis.enableSemanticValidation`**: 
  - `true` にすると、詳細な意味解析（型チェック、未定義変数の検出など）が有効になります。
  - ※デフォルトは `false` です。より安全なコーディングを行いたい場合は有効化してください。

- **`risaasir.diagnostics.minimumSeverity`**:
  - エラーメッセージに表示する最小のレベルを設定できます（ `"Error"` にすると `"Error"` 以外のメッセージは表示されなくなる）。
  - `"Error"`, `"Warning"`, `"Information"`, `"Hint"`, `"None"` の4つから選択できます。
  - ※デフォルトは `"Information"` です。

## 既知の問題

- 非常に複雑なマクロ定義や特殊な構文において、誤ったエラー報告（False Positive）が行われる場合があります。
- 計算時間がエラーメッセージとして表示されることがあります。

## ロードマップ

今後は以下の機能強化を予定しています。

- **ドキュメント整備**: 使い方をまとめたPDFの作成
- **解析精度の向上**: 意味解析（Semantic Analysis）のさらなる精度向上

## Release Notes

### 0.5.1
- **LSP機能の本格導入**:
  - ホバー情報の表示を改善（Markdown対応、引数名表示）
  - 定義ジャンプ機能の強化（別ファイルへの移動に対応）
  - 変数のセマンティックハイライトに対応
- 意味解析（Validator）の精度を大幅に向上させました。
- バグ修正と内部リファクタリングを行いました。

### 0.5.0
- 構文解析・意味解析機能を強化しました。
- 意味解析のオン/オフ設定を追加しました。

... (過去のログは省略します) ...

---

## 参考
- https://code.visualstudio.com/api/
- https://docs.npmjs.com/cli/v7/configuring-npm/package-json
- https://www.math.kobe-u.ac.jp/OpenXM/Current/doc/asir2000/html-ja/man/man.html
- https://www.math.kobe-u.ac.jp/Asir/asir-ja.html
- https://nodejs.org/docs/latest/api/
- http://www.math.sci.kobe-u.ac.jp/OpenXM/Current/doc/asir-contrib/ja/cman-ja.pdf
- https://yeoman.io/

