import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const file = readFileSync("artifacts/api-server/src/routes/discounts.ts", "utf8");
const ast = ts.createSourceFile("discounts.ts", file, ts.ScriptTarget.Latest, true);
let handler: ts.Node | undefined;
let predicate: ts.Node | undefined;
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "isCustomerIncentive") predicate = node;
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "router.get"
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/discount-codes") {
    handler = node.arguments[1];
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler && predicate);
const codes = [
  { id: 1, code: "PUBLIC20", description: "خصم للجميع" },
  { id: 2, code: "VIP-ABCDE", description: "تحفيز لأفضل عميل — private phone" },
  { id: 3, code: "OLD-CODE", description: "تحفيز لأفضل عميل — private phone" },
  { id: 4, code: "vip-other", description: null },
  { id: 5, code: "OTHER", description: "تحفيز لافضل عميل" },
  { id: 6, code: "SAVE10", description: null },
];
const js = ts.transpileModule(`${predicate.getText(ast)}
globalThis.handler = ${handler.getText(ast)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
for (const authenticated of [false, true]) {
  let reads = 0;
  let output: typeof codes = [];
  const headers: Record<string, string> = {};
  const query = {
    from() { return this; },
    orderBy() { return Promise.resolve(codes); },
    groupBy() { return Promise.resolve([]); },
    leftJoin() { return this; },
  };
  const ctx = vm.createContext({
    resolveOptionalDashboardActor: async () => authenticated ? { id: 1 } : null,
    db: { select: () => { reads++; return query; } },
    discountCodesTable: {}, discountCodeUsagesTable: {}, ordersTable: {},
    count: () => 0, eq: () => true, sql: () => 0,
  });
  vm.runInContext(js, ctx);
  await ctx.handler({}, {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    json: (value: typeof codes) => { output = value; },
  });
  assert.deepEqual(Array.from(output, row => row.id), authenticated ? [1, 2, 3, 4, 5, 6] : [1, 6]);
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(headers.Vary, "Cookie");
  assert.equal(reads, 3);
  if (!authenticated) assert.ok(!JSON.stringify(output).includes("private phone"));
}

const mobile = readFileSync("artifacts/rawabi-menu/app/(tabs)/offers.tsx", "utf8");
const mobileAst = ts.createSourceFile("offers.tsx", mobile, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let filter: ts.Expression | undefined;
function visitMobile(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(mobileAst) === "activeCodes") filter = node.initializer;
  ts.forEachChild(node, visitMobile);
}
visitMobile(mobileAst);
assert.ok(filter);
const filterJs = ts.transpileModule(`globalThis.result = ${filter.getText(mobileAst)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const ctx = vm.createContext({ allActiveCodes: codes });
vm.runInContext(filterJs, ctx);
assert.deepEqual(Array.from(ctx.result, (row: { id: number }) => row.id), [1, 6]);
console.log("PASS: public API and mobile hide current/legacy incentives; authenticated dashboard retains them; responses cannot be cached.");
