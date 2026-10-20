import assert from 'node:assert/strict';
import { Capacitor, registerPlugin } from '@capacitor/core';

// Real JS bridge helpers with an in-memory native implementation; no device or network.
globalThis.fetch = async () => { throw new Error('No network allowed'); };
Capacitor.isNativePlatform = () => true;
let saved = 100;
let writes = 0;
let fail = false;
registerPlugin('MerchantDevice', { web: () => ({
  getOrderAlertVolume: async () => ({ percent: saved }),
  setOrderAlertVolume: async ({ percent }: { percent: number }) => {
    if (fail) throw new Error('Synthetic native save failure');
    writes++;
    saved = percent;
  },
}) });
const { getOrderAlertVolume, setOrderAlertVolume } = await import('../src/lib/device');
assert.equal(await getOrderAlertVolume(), 100);
await setOrderAlertVolume(60);
assert.equal(writes, 1);
assert.equal(await getOrderAlertVolume(), 60);
for (const value of [0, 9, 101, 50.5, NaN]) {
  await assert.rejects(setOrderAlertVolume(value));
}
assert.equal(writes, 1, 'Invalid UI input must not reach the native bridge');
fail = true;
await assert.rejects(setOrderAlertVolume(100), /Synthetic native save failure/);
assert.equal(saved, 60, 'Failure must not be presented as a saved preference');
saved = 200;
await assert.rejects(getOrderAlertVolume());
console.log('Order volume bridge PASS: default, local save/read, bounds and explicit native failures.');
