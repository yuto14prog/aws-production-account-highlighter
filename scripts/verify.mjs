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

assertEqual(parseAccountId('Name (123456789012)'), '123456789012', 'plain 12 digits');
assertEqual(parseAccountId('Name (1234-5678-9012)'), '123456789012', 'hyphenated 12 digits');
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

if (process.exitCode) process.exit(process.exitCode);
console.log('ok');
