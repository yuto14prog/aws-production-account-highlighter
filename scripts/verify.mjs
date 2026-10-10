import { existsSync, readFileSync } from 'node:fs';
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

function assertEqual(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        console.error(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        process.exitCode = 1;
    }
}

function tick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function snapshot(value) {
    return JSON.parse(JSON.stringify(value));
}

function load() {
    const context = createContext({ console, setTimeout, queueMicrotask });
    runInContext(readFileSync(join(root, 'scripts/fake-storage.js'), 'utf8'), context);
    runInContext('installFakeStorage(globalThis)', context);
    runInContext(readFileSync(join(root, 'account-ids.js'), 'utf8'), context);
    return {
        AccountIds: runInContext('AccountIds', context),
        storage: runInContext('browser.storage', context),
        run(code) {
            return runInContext(code, context);
        },
    };
}

function invalidLine(line, text) {
    return `${line}行目「${text}」は半角数字12桁のアカウントIDではありません（例 123456789012、1234-5678-9012）`;
}

async function loadOptions(seed) {
    const context = createContext({ console, setTimeout, queueMicrotask });
    runInContext(readFileSync(join(root, 'scripts/fake-storage.js'), 'utf8'), context);
    runInContext('installFakeStorage(globalThis)', context);
    if (seed) {
        const storage = runInContext('browser.storage', context);
        await storage.local.set(seed);
        await tick();
    }
    runInContext(`
        const els = {
            ids: { value: '' },
            save: {
                disabled: true,
                addEventListener(type, fn) {
                    if (type === 'click') this.onclick = fn;
                },
            },
            status: { textContent: '' },
        };
        globalThis.__els = els;
        globalThis.document = {
            getElementById(id) {
                return els[id];
            },
        };
    `, context);
    runInContext(readFileSync(join(root, 'account-ids.js'), 'utf8'), context);
    runInContext(readFileSync(join(root, 'options.js'), 'utf8'), context);
    return {
        storage: runInContext('browser.storage', context),
        els: runInContext('__els', context),
    };
}

function assertManifestFiles() {
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    const named = [];
    for (const entry of manifest.content_scripts ?? []) {
        for (const file of entry.js ?? []) {
            named.push(file);
            if (file === 'config.js') {
                console.error('manifest names config.js');
                process.exitCode = 1;
            }
        }
    }
    if (manifest.options_ui && manifest.options_ui.page) named.push(manifest.options_ui.page);
    for (const file of Object.values(manifest.icons ?? {})) named.push(file);
    if (named.length === 0) {
        console.error('manifest names no files');
        process.exitCode = 1;
    }
    for (const file of named) {
        if (!existsSync(join(root, file))) {
            console.error(`missing manifest file: ${file}`);
            process.exitCode = 1;
        }
    }
    assertEqual(existsSync(join(root, 'config.sample.js')), false, 'config.sample.js is deleted');
    assertEqual(
        readFileSync(join(root, '.gitignore'), 'utf8').split('\n').includes('config.js'),
        true,
        'gitignore keeps config.js',
    );
    const optionsHtml = readFileSync(join(root, 'options.html'), 'utf8');
    const accountAt = optionsHtml.indexOf('src="account-ids.js"');
    const optionsAt = optionsHtml.indexOf('src="options.js"');
    assertEqual(accountAt !== -1 && optionsAt > accountAt, true, 'options page loads account ids first');
    assertEqual(
        /<button\b[^>]*\bdisabled\b[^>]*>\s*保存\s*<\/button>/.test(optionsHtml),
        true,
        'save button starts disabled',
    );
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

function watchSeen(accountIds) {
    const seen = [];
    accountIds.watch((ids) => {
        seen.push(snapshot(ids));
    });
    return seen;
}

async function main() {
    {
        const { AccountIds, storage } = load();
        const result = await AccountIds.save('1234-5678-9012');
        assertEqual(result, { ok: true, ids: ['123456789012'] }, 'save hyphenated id');
        const stored = await storage.local.get('productionAccountIds');
        assertEqual(stored.productionAccountIds, ['123456789012'], 'stored hyphenated id');
    }

    {
        const { AccountIds, storage } = load();
        const rejected = await AccountIds.save('Name (123456789012)');
        assertEqual(
            rejected,
            { ok: false, invalid: [{ line: 1, text: 'Name (123456789012)' }] },
            'save of a console sentence does not store that line',
        );
        const stored = await storage.local.get('productionAccountIds');
        assertEqual(stored, {}, 'sentence save writes nothing');
    }

    {
        const { AccountIds, storage } = load();
        const text = '123456789012\r\n 1234-5678-9012 \n\n210987654321\n2109-8765-4321';
        const seen = await watchSeen(AccountIds);
        await tick();
        const once = await AccountIds.save(text);
        const twice = await AccountIds.save(text);
        await tick();
        const stored = await storage.local.get('productionAccountIds');
        const ids = ['123456789012', '210987654321'];
        assertEqual(once, { ok: true, ids }, 'plain and hyphenated lines normalize and merge');
        assertEqual(twice, { ok: true, ids }, 'the same text saved twice stores the same array');
        assertEqual(stored.productionAccountIds, ids, 'stored merged list');
        assertEqual(seen[seen.length - 1], ids, 'watchers see the merged list');
        assertEqual(
            AccountIds.format(ids),
            '123456789012\n210987654321',
            'format joins ids with newlines',
        );
        assertEqual(
            await AccountIds.save(AccountIds.format(ids)),
            { ok: true, ids },
            'format round-trips through save',
        );
    }

    {
        const { AccountIds, storage } = load();
        await AccountIds.save('123456789012\n210987654321');
        await tick();
        const rejected = await AccountIds.save(
            [
                'Name (123456789012)',
                '12345',
                '１２３４５６７８９０１２',
                '1234-5678-9012-3456',
            ].join('\n'),
        );
        await tick();
        const stored = await storage.local.get('productionAccountIds');
        assertEqual(
            rejected,
            {
                ok: false,
                invalid: [
                    { line: 1, text: 'Name (123456789012)' },
                    { line: 2, text: '12345' },
                    { line: 3, text: '１２３４５６７８９０１２' },
                    { line: 4, text: '1234-5678-9012-3456' },
                ],
            },
            'a sentence, a short id, full-width digits, and an extra group reject with line numbers',
        );
        assertEqual(
            stored.productionAccountIds,
            ['123456789012', '210987654321'],
            'a rejected save leaves the stored list unchanged',
        );
    }

    {
        const { AccountIds, storage } = load();
        const seen = await watchSeen(AccountIds);
        await tick();
        const result = await AccountIds.save('');
        await tick();
        const stored = await storage.local.get('productionAccountIds');
        assertEqual(result, { ok: true, ids: [] }, 'an empty field stores an empty list');
        assertEqual(stored.productionAccountIds, [], 'stored empty list');
        assertEqual(seen[seen.length - 1], [], 'watchers see an empty list');
    }

    {
        const { AccountIds } = load();
        const seen = [];
        AccountIds.watch((ids) => {
            seen.push(snapshot(ids));
        });
        const result = await AccountIds.save('123456789012');
        await tick();
        assertEqual(result, { ok: true, ids: ['123456789012'] }, 'save during the first read');
        assertEqual(seen, [['123456789012']], 'a save before the first read settles wins');
    }

    {
        const { AccountIds, storage } = load();
        await storage.local.set({
            productionAccountIds: ['123456789012', '1234-5678-9012', 42, 'junk'],
        });
        await tick();
        const seen = await watchSeen(AccountIds);
        await tick();
        assertEqual(seen, [['123456789012']], 'a stored list drops junk and hyphen duplicates');
    }

    {
        const { AccountIds } = load();
        const seen = await watchSeen(AccountIds);
        await tick();
        assertEqual(seen, [[]], 'a missing key reads as an empty list');
    }

    {
        const { AccountIds, run } = load();
        run('function parseAccountId() { throw new Error("console parser"); }');
        const result = await AccountIds.save('1234-5678-9012');
        assertEqual(
            result,
            { ok: true, ids: ['123456789012'] },
            'hyphenated field saves without the console parser',
        );
    }

    {
        const context = createContext({ console, setTimeout, queueMicrotask });
        runInContext(readFileSync(join(root, 'scripts/fake-storage.js'), 'utf8'), context);
        runInContext('installFakeStorage(globalThis)', context);
        runInContext('globalThis.chrome = globalThis.browser; delete globalThis.browser;', context);
        runInContext(readFileSync(join(root, 'account-ids.js'), 'utf8'), context);
        const chromeOnly = runInContext('AccountIds', context);
        const result = await chromeOnly.save('123456789012');
        assertEqual(result, { ok: true, ids: ['123456789012'] }, 'chrome namespace without browser');
    }

    assertManifestFiles();

    {
        const page = await loadOptions();
        assertEqual(page.els.save.disabled, true, 'save stays disabled before the first read');
        assertEqual(page.els.ids.value, '', 'field stays empty before the first read');
        await tick();
        assertEqual(page.els.save.disabled, false, 'save enables after the first read');
        assertEqual(page.els.ids.value, '', 'an empty store fills an empty field');

        page.els.ids.value = '123456789012\n1234-5678-9012\n210987654321';
        await page.els.save.onclick();
        await tick();
        assertEqual(page.els.status.textContent, '保存しました（2件）', 'save reports the stored count');
        assertEqual(page.els.ids.value, '123456789012\n210987654321', 'save rewrites the field from the stored list');
        const stored = await page.storage.local.get('productionAccountIds');
        assertEqual(stored.productionAccountIds, ['123456789012', '210987654321'], 'options save stores the list');

        page.els.ids.value = 'Name (123456789012)\n12345';
        await page.els.save.onclick();
        assertEqual(
            page.els.status.textContent,
            [invalidLine(1, 'Name (123456789012)'), invalidLine(2, '12345')].join('\n'),
            'invalid lines name the line number and mention 半角',
        );
        assertEqual(page.els.ids.value, 'Name (123456789012)\n12345', 'a rejected save keeps the field text');
        const afterReject = await page.storage.local.get('productionAccountIds');
        assertEqual(
            afterReject.productionAccountIds,
            ['123456789012', '210987654321'],
            'a rejected options save leaves storage unchanged',
        );

        page.els.ids.value = '';
        await page.els.save.onclick();
        assertEqual(page.els.status.textContent, '保存しました（本番アカウントなし）', 'an empty save says there are no production accounts');
        const cleared = await page.storage.local.get('productionAccountIds');
        assertEqual(cleared.productionAccountIds, [], 'an empty options save stores an empty list');
    }

    {
        const page = await loadOptions({
            productionAccountIds: ['123456789012', '210987654321'],
        });
        await tick();
        assertEqual(page.els.ids.value, '123456789012\n210987654321', 'the first read fills the field');
        assertEqual(page.els.save.disabled, false, 'the first read enables save');
    }

    {
        const page = await loadOptions();
        await tick();
        page.storage.local.set = () => Promise.reject(new Error('unavailable'));
        page.els.ids.value = '123456789012';
        await page.els.save.onclick();
        assertEqual(page.els.status.textContent, '保存できませんでした', 'a storage rejection says the save failed');
        const stored = await page.storage.local.get('productionAccountIds');
        assertEqual(stored, {}, 'a rejected storage write stores nothing');
    }

    {
        const warnings = [];
        const context = createContext({
            console: {
                warn(...args) {
                    warnings.push(args);
                },
            },
            setTimeout,
            queueMicrotask,
        });
        runInContext(`
            globalThis.browser = {
                storage: {
                    local: {
                        get() { return Promise.reject(new Error('unavailable')); },
                        set() { return Promise.reject(new Error('unavailable')); },
                    },
                    onChanged: { addListener() {} },
                },
            };
            const els = {
                ids: { value: '123456789012' },
                save: {
                    disabled: true,
                    addEventListener(type, fn) {
                        if (type === 'click') this.onclick = fn;
                    },
                },
                status: { textContent: '' },
            };
            globalThis.__els = els;
            globalThis.document = {
                getElementById(id) {
                    return els[id];
                },
            };
        `, context);
        runInContext(readFileSync(join(root, 'account-ids.js'), 'utf8'), context);
        runInContext(readFileSync(join(root, 'options.js'), 'utf8'), context);
        const els = runInContext('__els', context);
        await tick();
        assertEqual(els.save.disabled, true, 'a failed read leaves save disabled');
        assertEqual(els.ids.value, '123456789012', 'a failed read does not fill the field');
        assertEqual(els.status.textContent, '', 'a failed read does not report a save');
        assertEqual(warnings.length, 1, 'a failed read warns once');
        assertEqual(
            warnings[0] && warnings[0][0],
            'AWS production account ids could not be read',
            'a failed read names the list in the warning',
        );
    }
}

main().then(() => {
    if (process.exitCode) process.exit(process.exitCode);
    console.log('ok');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
