function parseAccountId(text) {
    if (!text) return null;

    const paren = text.match(/\((\d{4})-?(\d{4})-?(\d{4})\)/);
    if (paren) return paren[1] + paren[2] + paren[3];

    const hyphen = text.match(/(?:^|[^\d])(\d{4})-(\d{4})-(\d{4})(?:[^\d]|$)/);
    if (hyphen) return hyphen[1] + hyphen[2] + hyphen[3];

    const plain = text.match(/(?:^|[^\d])(\d{12})(?:[^\d]|$)/);
    return plain ? plain[1] : null;
}

function accountIdFromHost(hostname) {
    const match = hostname && hostname.match(/^(\d{12})\./);
    return match ? match[1] : null;
}

function readAccountId(doc) {
    const label = doc.querySelector('span[data-testid="account-label"]');
    if (label) {
        const fromLabel = parseAccountId(label.textContent);
        if (fromLabel) return fromLabel;
    }

    const nav = doc.querySelector('div#awsc-top-level-nav');
    if (nav) {
        const fromNav = parseAccountId(nav.textContent);
        if (fromNav) return fromNav;
    }

    const hostname = doc.defaultView?.location?.hostname ?? globalThis.location?.hostname;
    return accountIdFromHost(hostname);
}

function readVerdict(doc, prodIds) {
    const accountId = readAccountId(doc);
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
