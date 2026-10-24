#!/usr/bin/env node
// Afterimage license tool.
//   node scripts/license.mjs keygen                 -> prints a new keypair (keep the secret key private!)
//   AFTERIMAGE_SECRET=... node scripts/license.mjs sign buyer@example.com [pro]
// The public key goes in src/lib/license.ts (PUBLIC_KEY). Keys are verified offline in the app.
import nacl from "tweetnacl";
import { signLicense } from "../server/license.mjs";

const [cmd, email, tier = "pro"] = process.argv.slice(2);
if (cmd === "keygen") {
  const kp = nacl.sign.keyPair();
  console.log("PUBLIC_KEY =", Buffer.from(kp.publicKey).toString("base64url"));
  console.log("SECRET_KEY =", Buffer.from(kp.secretKey).toString("base64url"));
} else if (cmd === "sign") {
  const sk = process.env.AFTERIMAGE_SECRET;
  if (!sk || !email) { console.error("usage: AFTERIMAGE_SECRET=... node scripts/license.mjs sign <email> [tier]"); process.exit(1); }
  console.log(signLicense(email, sk, tier));
} else {
  console.error("commands: keygen | sign <email> [tier]");
  process.exit(1);
}
