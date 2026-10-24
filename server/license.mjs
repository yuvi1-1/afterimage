// Shared by the license CLI and the payment API: signs an offline Ed25519 license key.
import nacl from "tweetnacl";

export function signLicense(email, secretB64u, tier = "pro") {
  const payload = Buffer.from(JSON.stringify({ e: email, t: tier, i: new Date().toISOString().slice(0, 10) }));
  const sig = nacl.sign.detached(payload, Buffer.from(secretB64u, "base64url"));
  return `AFTR-${payload.toString("base64url")}.${Buffer.from(sig).toString("base64url")}`;
}
