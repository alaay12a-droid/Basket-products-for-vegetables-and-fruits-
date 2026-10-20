import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercises the real component without creating orders or calling any service.
const bundle = await build({
  entryPoints: ['src/components/order-card.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
});
const mod = { exports: {} as { OrderCard?: (props: any) => React.ReactElement } };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  createRequire(import.meta.url), mod, mod.exports,
);
const OrderCard = mod.exports.OrderCard!;
const order = {
  id: 17, dailyNumber: 17, status: 'pending', customerName: 'عميل تجريبي',
  createdAt: '2026-10-20T10:00:00Z', orderType: 'delivery', totalPrice: 25,
  items: [{ id: 1, name: 'تفاح', quantity: 1 }],
};
const calls: string[] = [];
const props = {
  order, onOpen: () => calls.push('details'),
  onAccept: () => calls.push('accept'), onCancel: () => calls.push('cancel'),
};
function nodes(node: any): any[] {
  if (!React.isValidElement(node)) return [];
  const children = (node.props as any).children;
  return [node, ...React.Children.toArray(children).flatMap(nodes)];
}
const tree = OrderCard(props);
const find = (id: string) => nodes(tree).find(n => n.props['data-testid'] === id);
find('button-accept-order-17').props.onClick();
find('button-cancel-order-17').props.onClick();
find('card-order-17').props.onClick();
assert.deepEqual(calls, ['accept', 'cancel', 'details']);
const html = renderToStaticMarkup(tree);
assert.equal((html.match(/<button\b/g) ?? []).length, 3);
assert.ok(html.includes('قبول') && html.includes('إلغاء'));
assert.ok(!/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/.test(html), 'No nested buttons');
assert.ok(!renderToStaticMarkup(OrderCard({ ...props, order: { ...order, status: 'preparing' } })).includes('button-accept-order'));
for (const status of ['preparing', 'ready']) {
  const activeHtml = renderToStaticMarkup(OrderCard({ ...props, order: { ...order, status } }));
  assert.ok(activeHtml.includes('button-cancel-order-17'));
  assert.ok(!activeHtml.includes('button-accept-order-17'));
}
for (const status of ['done', 'cancelled', 'out_for_delivery']) {
  assert.ok(!renderToStaticMarkup(OrderCard({ ...props, order: { ...order, status } })).includes('button-cancel-order'));
}
assert.ok(!renderToStaticMarkup(OrderCard({ order, onOpen: props.onOpen })).includes('button-cancel-order'));
const locked = nodes(OrderCard({ ...props, actionsDisabled: true }))
  .filter(n => /button-(accept|cancel)-order/.test(n.props['data-testid'] ?? ''));
assert.equal(locked.length, 2);
assert.ok(locked.every(n => n.props.disabled));
console.log('Order-card actions: accept pending-only, cancel active-only, independent buttons, read-only/busy and history compatibility PASS');
