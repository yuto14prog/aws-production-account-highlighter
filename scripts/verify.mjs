import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'content.js'), 'utf8');
const parseSource = source.match(
    /function parseAccountId\(text\) \{[\s\S]*?\n\}/,
);
if (!parseSource) {
    console.error('parseAccountId not found in content.js');
    process.exit(1);
}

const sandbox = createContext({ console });
runInContext(parseSource[0], sandbox);
const { parseAccountId } = sandbox;

function sameVerdict(a, b) {
    return a.kind === b.kind && a.accountId === b.accountId;
}

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        console.error(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        process.exitCode = 1;
    }
}

function assertDeepEqual(actual, expected, label) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
        console.error(`${label}: got ${a}, expected ${b}`);
        process.exitCode = 1;
    }
}

assertEqual(parseAccountId('Name (123456789012)'), '123456789012', 'plain 12 digits');
assertEqual(parseAccountId('Name (1234-5678-9012)'), '123456789012', 'hyphenated 12 digits');
assertEqual(
    parseAccountId('アカウント ID: 4773-1321-6013'),
    '477313216013',
    'bare hyphenated console menu id',
);
assertEqual(
    parseAccountId('アカウント ID: 477313216013'),
    '477313216013',
    'bare plain console menu id',
);
assertEqual(parseAccountId('Name (1234-5678-901)'), null, 'short hyphenated id');
assertEqual(parseAccountId('Name (abcdefghijkl)'), null, 'non-digits');

const prod = { kind: 'prod', accountId: '123456789012' };
assertEqual(
    sameVerdict(prod, { kind: 'prod', accountId: '123456789012' }),
    true,
    'same prod id',
);
assertEqual(
    sameVerdict(prod, { kind: 'nonprod', accountId: '123456789012' }),
    false,
    'prod vs nonprod',
);

// One manifest for both browsers. Chrome ignores browser_specific_settings.
// Firefox AMO requires the gecko id and data_collection_permissions.
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
assertEqual(manifest.manifest_version, 3, 'manifest version');
assertDeepEqual(
    manifest.content_scripts?.[0]?.js,
    ['config.js', 'content.js'],
    'content script order',
);
const matches = manifest.content_scripts?.[0]?.matches ?? [];
assertEqual(
    matches.includes('https://*.console.aws.amazon.com/*') &&
        matches.includes('https://console.aws.amazon.com/*'),
    true,
    'aws console match patterns',
);
assertEqual(
    manifest.browser_specific_settings?.gecko?.id,
    '{5388CE81-7AEC-4FEB-BCE1-0FBC6045E4A7}',
    'firefox extension id',
);
assertDeepEqual(
    manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
    ['none'],
    'firefox data collection declaration',
);
assertEqual(manifest.background, undefined, 'no background worker');
if (/\b(?:chrome|browser)\.[A-Za-z]/.test(source)) {
    console.error('content.js uses a browser extension API; keep the highlighter on DOM APIs');
    process.exitCode = 1;
}

const readme = readFileSync(join(root, 'README.md'), 'utf8');
for (const needle of ['chrome://extensions', 'about:debugging', 'addons.mozilla.org', 'config.sample.js']) {
    if (!readme.includes(needle)) {
        console.error(`README is missing ${needle}`);
        process.exitCode = 1;
    }
}

const configSample = readFileSync(join(root, 'config.sample.js'), 'utf8');
const sampleIds = [...configSample.matchAll(/'(\d{12})'/g)].map((match) => match[1]);
assertEqual(sampleIds.length >= 1, true, 'sample has a production account id');

function hyphenate(id) {
    return `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}`;
}

function bootPage({ label, account, hostname }) {
    const observers = [];
    function MutationObserver(callback) {
        this.callback = callback;
        observers.push(this);
    }
    MutationObserver.prototype.observe = function observe() {};
    MutationObserver.prototype.disconnect = function disconnect() {};

    function makeElement(tag) {
        return {
            tag,
            id: '',
            attrs: new Map(),
            children: [],
            _text: '',
            appendChild(child) {
                this.children.push(child);
                return child;
            },
            setAttribute(name, value) {
                this.attrs.set(name, String(value));
            },
            getAttribute(name) {
                return this.attrs.has(name) ? this.attrs.get(name) : null;
            },
            removeAttribute(name) {
                this.attrs.delete(name);
            },
            get textContent() {
                const nested = this.children.map((child) => child.textContent).join('');
                return this._text + nested;
            },
            set textContent(value) {
                this._text = String(value);
                this.children = [];
            },
        };
    }

    function walk(node, visit) {
        visit(node);
        for (const child of node.children) walk(child, visit);
    }

    function query(selector) {
        let found = null;
        walk(documentElement, (node) => {
            if (found) return;
            if (
                selector === 'span[data-testid="account-label"]' &&
                node.tag === 'span' &&
                node.attrs.get('data-testid') === 'account-label'
            ) {
                found = node;
            }
            if (selector === 'div#awsc-top-level-nav' && node.id === 'awsc-top-level-nav') {
                found = node;
            }
        });
        return found;
    }

    const documentElement = makeElement('html');
    const head = makeElement('head');
    const body = makeElement('body');
    const nav = makeElement('div');
    nav.id = 'awsc-top-level-nav';
    const labelEl = makeElement('span');
    labelEl.attrs.set('data-testid', 'account-label');
    labelEl._text = label;
    const accountEl = makeElement('span');
    accountEl._text = account;
    nav.children.push(labelEl, accountEl);
    documentElement.children.push(head, body);
    body.children.push(nav);

    const document = {
        documentElement,
        head,
        body,
        defaultView: { location: { hostname } },
        getElementById(id) {
            let found = null;
            walk(documentElement, (node) => {
                if (node.id === id) found = node;
            });
            return found;
        },
        querySelector: query,
        createElement: makeElement,
        addEventListener() {},
    };

    const logs = [];
    const context = createContext({
        console: { info: (...args) => logs.push(args.join(' ')) },
        document,
        MutationObserver,
    });
    runInContext(`${configSample}\n${source}`, context);
    return {
        documentElement,
        accountEl,
        logs,
        flush() {
            for (const observer of observers) observer.callback([]);
        },
    };
}

const page = bootPage({
    label: 'fixture-role/user@example.com',
    account: `アカウント ID: ${hyphenate(sampleIds[0])}`,
    hostname: 'console.aws.amazon.com',
});
assertEqual(
    page.documentElement.attrs.get('data-aws-prod') ?? null,
    sampleIds[0],
    'prod account sets data-aws-prod',
);
const style = page.documentElement.children[0].children.find((node) => node.id === 'aws-prod-hl-style');
assertEqual(Boolean(style), true, 'highlight style installed');
assertEqual(
    style?.textContent.includes('#FF0066') && style.textContent.includes('div#awsc-top-level-nav'),
    true,
    'highlight style targets the console nav',
);

page.accountEl._text = 'アカウント ID: 9999-9999-9999';
page.flush();
assertEqual(
    page.documentElement.attrs.has('data-aws-prod'),
    false,
    'nonprod account clears data-aws-prod',
);

if (sampleIds[1]) {
    page.accountEl._text = `アカウント ID: ${hyphenate(sampleIds[1])}`;
    page.flush();
    assertEqual(
        page.documentElement.attrs.get('data-aws-prod') ?? null,
        sampleIds[1],
        'another production account highlights',
    );
}

const fromHost = bootPage({
    label: 'no-id',
    account: 'menu',
    hostname: `${sampleIds[0]}.console.aws.amazon.com`,
});
assertEqual(
    fromHost.documentElement.attrs.get('data-aws-prod') ?? null,
    sampleIds[0],
    'account id from console hostname',
);

if (process.exitCode) process.exit(process.exitCode);
console.log('ok');
