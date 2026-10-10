# AWS Production Account Highlighter

## 本番アカウントIDの設定

設定画面で本番アカウントIDを保存します。

1. 設定画面を開きます。
   - Firefoxでは `about:addons` を開き、AWS Production Account Highlighter の設定を開きます。
   - Chromeでは `chrome://extensions` を開き、詳細から拡張機能のオプションを開きます。
2. IDを1行に1つ、半角で入力します。`123456789012` と `1234-5678-9012` のどちらも保存できます。全角数字は保存できません。
3. 「保存」を押します。

開いているAWSコンソールに反映されます。ページの再読み込みは不要です。

「保存」は、保存済みのIDを読み終わるまで押せません。読み込みに失敗したときも押せません。

## 1.0.x からの更新

拡張機能は `config.js` を読み込みません。更新直後の一覧は空です。

1. `config.js` の `PRODUCTION_ACCOUNT_IDS` にあるIDを、設定画面に1行に1つ入力します。
2. 「保存」を押します。
3. `config.js` を削除します。

保存するまでヘッダーは強調表示されません。

## ZIP化（Firefox用）

次のコマンドでZIPを作ります。

```bash
zip -r aws-prod-highlighter.zip manifest.json *.js *.html icons/ -x config.js "*.DS_Store" "*/__MACOSX/*"
```

作ったZIPを https://addons.mozilla.org/ja/developers/addons にアップロードします。

## 確認

次のコマンドを実行します。

```bash
node scripts/verify.mjs
```

`ok` と出れば成功です。

`scripts/fixture.html` をブラウザで開きます。タイトルが `PASS` なら成功です。
