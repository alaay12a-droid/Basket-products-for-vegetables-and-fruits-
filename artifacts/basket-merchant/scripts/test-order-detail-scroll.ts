import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';

// Render the real component tree with a tiny hook harness; no network or orders.
const order = {
  id: 17, dailyNumber: 17, status: 'pending', customerName: 'عميل تجريبي',
  customerPhone: '0500000000', createdAt: '2026-10-20T10:00:00Z',
  orderType: 'delivery', totalPrice: 25, paymentMethod: 'cash', deliveryFee: 0,
  items: [{ id: 1, name: 'تفاح', quantity: 1, price: 25 }],
};
const fixture = {
  snap: { orders: [order], messages: [] as any[] },
  ro: true, busy: false, settings: {}, printingIds: [], printErrors: {},
};
const bundle = await build({
  entryPoints: ['src/components/order-detail.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  plugins: [{
    name: 'merchant-fixture',
    setup(b) {
      b.onResolve({ filter: /^@\/lib\/merchant$/ }, () => ({ path: 'fixture', namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
        contents: 'export const useMerchant = () => globalThis.__scrollTestFixture;',
      }));
    },
  }],
});
(globalThis as any).__scrollTestFixture = fixture;
let cursor = 0;
let slots: any[] = [];
let effects: (() => void)[] = [];
const effect = (fn: () => void, deps: unknown[]) => {
  const i = cursor++;
  if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i][j]))) effects.push(fn);
  slots[i] = deps;
};
const hooks = {
  ...React,
  useState: (initial: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], (value: unknown) => { slots[i] = value; }];
  },
  useRef: (initial: unknown) => {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: initial });
  },
  useMemo: (fn: () => unknown) => fn(),
  useEffect: effect, useLayoutEffect: effect,
};
const require = createRequire(import.meta.url);
const mod = { exports: {} as any };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  (name: string) => name === 'react' ? hooks : require(name), mod, mod.exports,
);
function nodes(node: any): any[] {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray((node.props as any).children).flatMap(nodes)];
}
function render(action?: 'accept' | 'cancel') {
  cursor = 0; effects = [];
  const root = mod.exports.OrderDetail({ orderId: order.id, onClose() {}, initialAction: action });
  const body = nodes(root).find(n => n.type?.name === 'Body');
  assert.ok(body, 'Real order-details body is rendered');
  return body.type(body.props);
}
for (const action of [undefined, 'accept', 'cancel'] as const) {
  slots = [];
  const tree = render(action);
  const outer = nodes(tree).find(n => n.props['data-testid'] === 'order-detail-scroll');
  const chat = nodes(tree).find(n => n.props['data-testid'] === 'chat-list');
  const outerView = { scrollTop: 700, scrollHeight: 2000 };
  const chatView = { scrollTop: 0, scrollHeight: 300 };
  outer.props.ref.current = outerView;
  chat.props.ref.current = chatView;
  effects.forEach(fn => fn());
  assert.equal(outerView.scrollTop, 0, 'Every opening starts at the top');
  const first = React.Children.toArray(outer.props.children).find(React.isValidElement) as any;
  assert.ok(nodes(first).some(n => n.props['data-testid'] === 'button-accept'), 'Acceptance is first in DOM for all entry paths');
  assert.ok(nodes(first).some(n => n.props['data-testid'] === 'button-reject'));
  outerView.scrollTop = 250;
  fixture.snap.messages = [{ id: 1, orderId: order.id, text: 'رسالة', fromCashier: false, createdAt: '2026-10-20T11:00:00Z' }];
  render(action);
  effects.forEach(fn => fn());
  assert.equal(outerView.scrollTop, 250, 'New messages cannot move the order viewport');
  assert.equal(chatView.scrollTop, 300, 'Only the chat list scrolls');
  fixture.snap.messages = [];
}
delete (globalThis as any).__scrollTestFixture;
console.log('Order details: top on open, acceptance first for all entry paths, message scrolling isolated PASS');
