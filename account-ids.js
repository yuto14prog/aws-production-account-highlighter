const AccountIds = (() => {
    const KEY = 'productionAccountIds';

    function exactAccountId(text) {
        const line = text.trim();
        if (/^\d{12}$/.test(line)) return line;
        const parts = line.match(/^(\d{4})-(\d{4})-(\d{4})$/);
        if (parts) return parts[1] + parts[2] + parts[3];
        return null;
    }

    function parseList(text) {
        const ids = [];
        const invalid = [];
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;
            const id = exactAccountId(line);
            if (!id) {
                invalid.push({ line: i + 1, text: line });
                continue;
            }
            if (!ids.includes(id)) ids.push(id);
        }
        if (invalid.length > 0) return { ok: false, invalid };
        return { ok: true, ids };
    }

    function fromStored(value) {
        if (!Array.isArray(value)) return [];
        const ids = [];
        for (const entry of value) {
            if (typeof entry !== 'string') continue;
            const id = exactAccountId(entry);
            if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
    }

    function browserStorage() {
        return (globalThis.browser ?? globalThis.chrome).storage;
    }

    async function save(text) {
        const result = parseList(text);
        if (result.ok) {
            await browserStorage().local.set({ [KEY]: result.ids });
        }
        return result;
    }

    function watch(listener) {
        const store = browserStorage();
        let changed = false;
        store.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !(KEY in changes)) return;
            changed = true;
            listener(fromStored(changes[KEY].newValue));
        });
        store.local.get(KEY).then(
            (items) => {
                if (!changed) listener(fromStored(items[KEY]));
            },
            (error) => {
                console.warn('AWS production account ids could not be read', error);
            },
        );
    }

    function format(ids) {
        return ids.join('\n');
    }

    return Object.freeze({ save, watch, format });
})();
