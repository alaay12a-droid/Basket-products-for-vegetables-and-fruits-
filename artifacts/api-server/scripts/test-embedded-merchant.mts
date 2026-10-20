import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import express from "express";
import { createEmbeddedMerchant } from "../src/lib/embedded-merchant";

// Only local mock services. No production DB, sessions, requests or notifications.
const publicDir = await mkdtemp(path.join(tmpdir(), "basket-merchant-mount-"));
await writeFile(path.join(publicDir, "index.html"), "<html>merchant-test-ui</html>");
await writeFile(path.join(publicDir, "asset.js"), "/* merchant-test-asset */");
let loads = 0;
let attachments = 0;
const loader = async () => {
  loads++;
  return {
    merchantService(base: string, _port: number) {
      assert.equal(base, "/basket-merchant/");
      const app = express();
      app.use(express.json());
      app.get(`${base}api/merchant/status`, (_req, res) => res.json({ enabled: true }));
      app.post(`${base}api/merchant/login`, (req, res) => {
        res.status(req.body.username === "fixture" ? 200 : 401).json({ fixture: true });
      });
      app.get(`${base}api/merchant/state`, (_req, res) => res.status(401).json({ error: "fixture-auth-required" }));
      return { app, attach() { attachments++; } };
    },
  };
};
async function withServer(enabled: boolean, load: typeof loader, test: (url: string) => Promise<void>) {
  const integration = createEmbeddedMerchant(load, () => enabled, publicDir);
  const app = express();
  app.use(integration.middleware);
  app.get("/api/core-fixture", (_req, res) => res.json({ core: true }));
  app.get("/dashboard", (_req, res) => res.send("dashboard-fixture"));
  const server = createServer(app);
  await integration.attach(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try { await test(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
try {
  await withServer(false, loader, async url => {
    assert.equal((await fetch(`${url}/basket-merchant/api/merchant/status`)).status, 503);
    assert.equal((await fetch(`${url}/api/core-fixture`)).status, 200);
    assert.equal(loads, 0, "Disabled service does not import or activate merchant code");
  });
  await withServer(true, loader, async url => {
    assert.deepEqual(await (await fetch(`${url}/basket-merchant/api/merchant/status`)).json(), { enabled: true });
    assert.equal((await fetch(`${url}/basket-merchant/api/merchant/state`)).status, 401);
    assert.equal((await fetch(`${url}/basket-merchant/api/merchant/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "fixture" }),
    })).status, 200);
    for (const pathname of ["/basket-merchant", "/basket-merchant/", "/basket-merchant/settings"]) {
      assert.match(await (await fetch(url + pathname)).text(), /merchant-test-ui/);
    }
    assert.match(await (await fetch(`${url}/basket-merchant/asset.js`)).text(), /merchant-test-asset/);
    const unknown = await fetch(`${url}/basket-merchant/api/unknown`);
    assert.equal(unknown.status, 404);
    assert.match(unknown.headers.get("content-type")!, /json/);
    assert.deepEqual(await (await fetch(`${url}/api/core-fixture`)).json(), { core: true });
    assert.equal(await (await fetch(`${url}/dashboard`)).text(), "dashboard-fixture");
    assert.equal(loads, 1, "HTTP and websocket attachment share one merchant instance");
    assert.equal(attachments, 1, "Websocket/background service attached once");
  });
  await withServer(true, async () => { throw new Error("fixture-module-unavailable"); }, async url => {
    assert.equal((await fetch(`${url}/basket-merchant/`)).status, 503);
    assert.equal((await fetch(`${url}/api/core-fixture`)).status, 200, "Merchant failure leaves core API running");
    assert.equal((await fetch(`${url}/dashboard`)).status, 200);
  });
  console.log("Embedded merchant: opt-in, isolated paths/auth, assets, SPA, one attachment and core failure isolation PASS");
} finally {
  await rm(publicDir, { recursive: true, force: true });
}
