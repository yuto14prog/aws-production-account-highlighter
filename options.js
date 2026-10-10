const field = document.getElementById('ids');
const saveButton = document.getElementById('save');
const status = document.getElementById('status');

function describeInvalid(item) {
    return `${item.line}行目「${item.text}」は半角数字12桁のアカウントIDではありません（例 123456789012、1234-5678-9012）`;
}

AccountIds.watch((ids) => {
    field.value = AccountIds.format(ids);
    saveButton.disabled = false;
});

saveButton.addEventListener('click', async () => {
    let result;
    try {
        result = await AccountIds.save(field.value);
    } catch {
        status.textContent = '保存できませんでした';
        return;
    }
    if (!result.ok) {
        status.textContent = result.invalid.map(describeInvalid).join('\n');
        return;
    }
    field.value = AccountIds.format(result.ids);
    status.textContent = result.ids.length === 0
        ? '保存しました（本番アカウントなし）'
        : `保存しました（${result.ids.length}件）`;
});
