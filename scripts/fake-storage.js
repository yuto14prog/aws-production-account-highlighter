function installFakeStorage(target) {
    const listeners = [];

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function area(name) {
        const data = {};
        return {
            get(key) {
                const snapshot = Object.prototype.hasOwnProperty.call(data, key)
                    ? { [key]: clone(data[key]) }
                    : {};
                return new Promise((resolve) => {
                    setTimeout(() => resolve(snapshot), 0);
                });
            },
            set(items) {
                const changes = {};
                for (const key of Object.keys(items)) {
                    changes[key] = {
                        oldValue: clone(data[key]),
                        newValue: clone(items[key]),
                    };
                    data[key] = clone(items[key]);
                }
                queueMicrotask(() => {
                    for (const listener of listeners) listener(changes, name);
                });
                return Promise.resolve();
            },
        };
    }

    target.browser = {
        storage: {
            local: area('local'),
            onChanged: {
                addListener(listener) {
                    listeners.push(listener);
                },
            },
        },
    };
}
