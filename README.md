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

3. ブラウザに拡張機能としてインストール
