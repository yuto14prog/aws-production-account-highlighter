// 本番アカウントIDをconfig.jsから読み込み
const PRODUCTION_ACCOUNT_IDS = CONFIG.PRODUCTION_ACCOUNT_IDS;

// ヘッダーの背景色を変更する関数
function highlightProductionAccount() {
    // アカウントIDを取得
    const accountElement = document.querySelector('span[data-testid="account-label"]');

    if (!accountElement) {
        console.log('AWS Account ID element not found');
        return;
    }

    const accountText = accountElement.textContent.trim();
    console.log('Detected account text:', accountText);

    // 正規表現でアカウントID部分を抽出
    // 形式: "アカウント名 (1234-5678-9012)" からアカウントIDを取得
    const accountIdMatch = accountText.match(/\((\d{4}-\d{4}-\d{4})\)/);

    if (!accountIdMatch) {
        console.log('Account ID pattern not found in text');
        return;
    }

    // ハイフンを除去して12桁の数字にする
    const accountId = accountIdMatch[1].replace(/-/g, '');
    console.log('Extracted AWS Account ID:', accountId);

    // 本番アカウントかチェック
    if (PRODUCTION_ACCOUNT_IDS.includes(accountId)) {
        console.log('Production account detected!');

        // ヘッダー要素を取得
        const header = document.querySelector('div#awsc-top-level-nav');

        if (header) {
            header.style.backgroundColor = '#FF0066';
            header.style.transition = 'background-color 0.3s ease';
        } else {
            console.log('Header element not found');
        }
    } else {
        console.log('Not a production account');
    }
}

// DOM変更を監視して再実行
function observeDOM() {
    highlightProductionAccount();

    const observer = new MutationObserver((mutations) => {
        highlightProductionAccount();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// ページ読み込み完了後に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeDOM);
} else {
    observeDOM();
}
