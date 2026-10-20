import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { merchantService } from "./service";

const port = Number(process.env.PORT);
if (!port) throw new Error("PORT is required");
const base = process.env.BASE_PATH ?? "/basket-merchant/";
const service = merchantService(base, port);
const app = express();
app.use(service.app);
app.use(base, express.static(path.resolve(import.meta.dirname, "../dist/public")));
app.get(`${base}*splat`, (_req, res) => res.sendFile(path.resolve(import.meta.dirname, "../dist/public/index.html")));
const server = createServer(app);
service.attach(server);
server.listen(port, "0.0.0.0");
