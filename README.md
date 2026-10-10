# AWS Production Account Highlighter

本番アカウントでログインしているとき、AWSコンソールのヘッダーを赤くします。
Chrome と Firefox は同じディレクトリを読み込みます。`manifest.json` の `browser_specific_settings` は Firefox（AMO の拡張機能 ID とデータ収集の申告）用です。Chrome はそのキーを読み飛ばして拡張機能を有効にします。強調表示は DOM だけを見ます。

## セットアップ

1. `config.sample.js`を`config.js`にコピー
```bash
cp config.sample.js config.js
```

2. `config.js`を編集して、本番アカウントIDを設定
```javascript
const CONFIG = {
  PRODUCTION_ACCOUNT_IDS: [
    '477313216013',  // 実際のアカウントID
  ]
};
```

`config.js` は手元のファイルです。リポジトリにはコミットしません。

## Chrome にインストール

1. `chrome://extensions` を開く
2. デベロッパーモードをオンにする
3. 「パッケージ化されていない拡張機能を読み込む」で、`manifest.json` があるディレクトリを選ぶ
4. すでに開いている AWS コンソールのタブを開き直す

## Firefox にインストール

一時的に確認する場合:

1. `about:debugging#/runtime/this-firefox` を開く
2. 「一時的なアドオンを読み込む」で `manifest.json` を選ぶ

AMO に出す場合は ZIP にしてアップロードします。

```bash
zip -r aws-prod-highlighter.zip manifest.json content.js config.js icons/ -x "*.DS_Store" "*/__MACOSX/*"
```

- https://addons.mozilla.org/ja/developers/addons
- 上記へアップロード
