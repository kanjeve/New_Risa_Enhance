# Change Log

All notable changes to the "risa-enhancers" extension will be documented in this file.

Check [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) for recommendations on how to structure this file.

---

## [0.5.0]

### Adeed
- 意味解析機能の強化による一部機能の追加
    - 変数や定数にカーソルを合わせるとホバー情報が表示されるようになりました。
    - セマンティックハイライトされるようになりました。
    - F2キーを押せば変数や関数の名前を一気に変えることができるようになりました。
    - load, import, #include で読み込んだファイルも解析されるようになりました。
- エラーメッセージの情報の制限機能の追加
    - 設定の"risa-enhancers.diagnostics.minimumSeverity"で問題として表示される種類を制限できるようにしました。デフォルトでは"Information"以下です。"Hint", "Information", "Warning", "Error"の順に表示レベルが低くなり、"None"を設定すると、何も表示されなくなります。

### Changed
- 意味解析を切ることができるようになりました。また、デフォルトでは意味解析は働きません。設定の "risaasir.analysis.enableSemanticValidation" という項目にチェックを入れる（または true）にすることで、意味解析機能をオンにできます。意味解析機能はまだまだ製作途中ですので、利用する方はバグ情報を教えていただけると幸いです。
- Risa/Asir の実行ディレクトリが現在開いているディレクトリになりました。
- シンタックスハイライトを独自のテーマではなく、通常のテーマに合わせる形に変更しました。そのため、一部の色が変わっています。

### Deprecated

### Removed

### Fixed
- 構文解析や意味解析で正しいコードに対してエラーが出る問題の一部を改善しました。意味解析は先述の通りまだ予期せぬエラーが出るかと思いますが、構文解析は正しく行われるかと思います。
- 最後の行が実行されない問題を改善しました。

### Security

---
**※バージョン0.4.2以前のログは作成しておりません。バージョンごとの違いについてまとめたpdfファイルを作成予定ですので、完成しましたら、そちらをご覧ください。**