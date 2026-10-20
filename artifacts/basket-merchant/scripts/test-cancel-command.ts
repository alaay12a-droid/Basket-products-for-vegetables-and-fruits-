import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Isolate the real command handler: no credentials, database or real HTTP calls.
let status = 'pending';
let permitted = true;
let failCore = false;
const writes: unknown[][] = [];
const requests: unknown[][] = [];
const bundle = await build({
  entryPoints: ['server/commands.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{
    name: 'isolated-order-state',
    setup(b) {
      b.onResolve({ filter: /^\.\/(database|snapshot)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: args.path === './database'
          ? 'export const rows=(...args)=>fixture.rows(...args); export const database=()=>{throw Error("No real database allowed")}'
          : 'export const authorizeOrder=(...args)=>fixture.authorizeOrder(...args); export const saveSetting=()=>{throw Error("No settings writes allowed")}',
        loader: 'js',
      }));
    },
  }],
});
const mod = { exports: {} as { runCommand?: (...args: any[]) => Promise<unknown> } };
new Function('require', 'module', 'exports', 'fixture', bundle.outputFiles[0].text)(
  createRequire(import.meta.url), mod, mod.exports, {
    rows: async (...args: unknown[]) => { writes.push(args); return []; },
    authorizeOrder: async () => {
      if (!permitted) throw Object.assign(new Error('Forbidden branch'), { status: 404 });
      return { id: 17, branchId: 1, status };
    },
  },
);
const actor = { id: 1, username: 'fixture', role: 'cashier', branchIds: [1] };
const run = (reason: unknown = 'طلب العميل') => mod.exports.runCommand!(
  actor, 'reject', '17', { reason },
  async (...args: unknown[]) => {
    if (failCore) throw Object.assign(new Error('Core refused'), { status: 409 });
    requests.push(args);
  },
);
for (status of ['pending', 'preparing', 'ready']) {
  writes.length = requests.length = 0;
  await run('  طلب العميل  ');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0][1], [17, 'طلب العميل']);
  assert.deepEqual(requests, [[actor, '/orders/17/status', 'PATCH', { status: 'cancelled' }]]);
}
for (status of ['done', 'cancelled', 'out_for_delivery']) {
  writes.length = requests.length = 0;
  await assert.rejects(run(), (e: any) => e.status === 409);
  assert.equal(writes.length + requests.length, 0);
}
status = 'preparing';
for (const reason of ['', '   ', 'x'.repeat(1001), null]) {
  writes.length = requests.length = 0;
  await assert.rejects(run(reason));
  assert.equal(writes.length + requests.length, 0);
}
permitted = false;
await assert.rejects(run(), (e: any) => e.status === 404);
permitted = true;
failCore = true;
await assert.rejects(run(), /Core refused/);
console.log('Cancellation command: allowed/terminal states, branch authorization, required reason and core failure PASS; no real writes.');
