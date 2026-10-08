function parseAccountId(text) {
    const match = text.match(/\((\d{4})-?(\d{4})-?(\d{4})\)/);
    return match ? match[1] + match[2] + match[3] : null;
}

function readVerdict(doc, prodIds) {
    const label = doc.querySelector('span[data-testid="account-label"]');
    if (!label) return { kind: 'unknown' };

    const accountId = parseAccountId(label.textContent);
    if (!accountId) return { kind: 'unknown' };
    if (prodIds.has(accountId)) return { kind: 'prod', accountId };
    return { kind: 'nonprod', accountId };
}

function installStyle() {
    if (document.getElementById('aws-prod-hl-style')) return;

    const style = document.createElement('style');
    style.id = 'aws-prod-hl-style';
    style.textContent =
        'html[data-aws-prod] div#awsc-top-level-nav { background-color: #FF0066 !important; transition: background-color 0.3s ease; }';
    document.head.appendChild(style);
}

function applyVerdict(v) {
    const root = document.documentElement;
    const prev = root.getAttribute('data-aws-prod');

    if (v.kind === 'prod') {
        root.setAttribute('data-aws-prod', v.accountId);
        if (prev !== v.accountId) console.info('AWS production account', v.accountId);
        return;
    }

    if (prev !== null) console.info('Left AWS production account');
    root.removeAttribute('data-aws-prod');
}

function makeReconciler(prodIds) {
    let last = { kind: 'unknown' };

    return function reconcile() {
        const next = readVerdict(document, prodIds);
        if (next.kind === last.kind && next.accountId === last.accountId) return;
        applyVerdict(next);
        last = next;
    };
}

function boot() {
    const prodIds = new Set(CONFIG.PRODUCTION_ACCOUNT_IDS);
    installStyle();
    const reconcile = makeReconciler(prodIds);
    reconcile();

    new MutationObserver(() => {
        reconcile();
    }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });
}

if (document.body) {
    boot();
} else {
    document.addEventListener('DOMContentLoaded', boot);
}
