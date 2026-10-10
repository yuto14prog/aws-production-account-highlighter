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
}

main().then(() => {
    if (process.exitCode) process.exit(process.exitCode);
    console.log('ok');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
