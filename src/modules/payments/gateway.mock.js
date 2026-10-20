// Fake payment gateway. `simulate: 'fail'` forces a failure so you can demo the compensation.
async function charge({ amount, idempotencyKey, simulate }) {
  await new Promise((r) => setTimeout(r, 200));
  if (simulate === 'fail') return { ok: false };
  return { ok: true, providerRef: `mock_${idempotencyKey}` };
}

module.exports = { charge };