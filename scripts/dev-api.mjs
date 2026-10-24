// Local API for development: serves /api/create-order and /api/verify-payment on :8787.
// Reads .env from the project root. Vite proxies /api here (see vite.config.ts).
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createOrder, verifyPayment } = await import("../server/payments.mjs");
const routes = { "/api/create-order": createOrder, "/api/verify-payment": verifyPayment };
const PORT = +(process.env.API_PORT || 8787);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handler = routes[url.pathname];
  if (!handler) { res.writeHead(404).end("not found"); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const r = await handler(request);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`Afterimage API on http://localhost:${PORT}`));
