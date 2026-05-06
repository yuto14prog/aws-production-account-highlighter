# AWS Production Account Highlighter

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

3. ZIP化（Firefox用）
```bash
zip -r aws-prod-highlighter.zip manifest.json content.js config.js icons/ -x "*.DS_Store" "*/__MACOSX/*"
```

4. Firefoxにインストール
- https://addons.mozilla.org/ja/developers/addons
- 上記へアップロード
