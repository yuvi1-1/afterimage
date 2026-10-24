#!/usr/bin/env node
// Afterimage license tool.
//   node scripts/license.mjs keygen                 -> prints a new keypair (keep the secret key private!)
//   AFTERIMAGE_SECRET=... node scripts/license.mjs sign buyer@example.com [pro]
// The public key goes in src/lib/license.ts (PUBLIC_KEY). Keys are verified offline in the app.
import nacl from "tweetnacl";

const b64u = (u8) => Buffer.from(u8).toString("base64url");
const [cmd, email, tier = "pro"] = process.argv.slice(2);

if (cmd === "keygen") {
  const kp = nacl.sign.keyPair();
  console.log("PUBLIC_KEY =", b64u(kp.publicKey));
  console.log("SECRET_KEY =", b64u(kp.secretKey));
} else if (cmd === "sign") {
  const sk = process.env.AFTERIMAGE_SECRET;
  if (!sk || !email) { console.error("usage: AFTERIMAGE_SECRET=... node scripts/license.mjs sign <email> [tier]"); process.exit(1); }
  const payload = Buffer.from(JSON.stringify({ e: email, t: tier, i: new Date().toISOString().slice(0, 10) }));
  const sig = nacl.sign.detached(payload, Buffer.from(sk, "base64url"));
  console.log(`AFTR-${b64u(payload)}.${b64u(sig)}`);
} else {
  console.error("commands: keygen | sign <email> [tier]");
  process.exit(1);
}
