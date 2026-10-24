// Razorpay Standard Checkout: order creation + signature verification.
// Framework-free: each handler takes a Web Request and returns a Web Response,
// so the same code runs on Netlify Functions, the local dev server, or any Node host.
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { signLicense } from "./license.mjs";

// Trim: pasted dashboard values often carry a trailing space or newline, which Razorpay rejects as bad credentials.
const env = (k, d) => { const v = process.env[k]; return v == null || v.trim() === "" ? d : v.trim().replace(/^["']|["']$/g, ""); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(req) {
  const origin = req.headers.get("origin") || "";
  const allowed = env("ALLOWED_ORIGINS", "https://yuvi1-1.github.io,app://afterimage,http://localhost:5173,http://127.0.0.1:5180")
    .split(",").map((s) => s.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
const json = (req, status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(req) } });

async function body(req) {
  try { return await req.json(); } catch { return null; }
}

/** POST /api/create-order  { email } -> { order_id, amount, currency, key_id } */
export async function createOrder(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Use POST." });
  const keyId = env("RAZORPAY_KEY_ID"), keySecret = env("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json(req, 500, { error: "Payments aren't configured on the server." });

  const b = (await body(req)) || {};
  const email = String(b.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return json(req, 400, { error: "Enter a valid email address. Your license key is tied to it." });

  // The price is decided by the server, never by the browser.
  const amount = parseInt(env("PRO_PRICE_PAISE", "99900"), 10);
  const currency = env("PRO_CURRENCY", "INR");
  if (!Number.isInteger(amount) || amount < 100) return json(req, 500, { error: "Server price is misconfigured (minimum is 100 paise)." });

  try {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.create({
      amount,
      currency,
      receipt: `afterimage-${Date.now()}`,
      notes: { product: "Afterimage Pro", email },
    });
    return json(req, 200, { order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId });
  } catch (e) {
    const status = e?.statusCode === 401 ? 401 : 500;
    const msg = e?.error?.description || e?.message || "Razorpay request failed";
    // Private diagnostics (Netlify → Logs → Functions). Never logs the secret itself.
    console.error("create-order failed:", status, msg, { keyId, secretLength: keySecret.length, secretLooksLikeKeyId: keySecret.startsWith("rzp_") });
    const hint = status === 401
      ? `Payment provider rejected the server's credentials (key ${keyId.slice(0, 12)}…, ${keyId.startsWith("rzp_live_") ? "live" : "test"} mode). Check that RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Netlify are a matching pair, then redeploy.`
      : `Couldn't start the payment: ${msg}`;
    return json(req, status, { error: hint });
  }
}

/** POST /api/verify-payment  { razorpay_order_id, razorpay_payment_id, razorpay_signature } -> { ok, license } */
export async function verifyPayment(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Use POST." });
  const keyId = env("RAZORPAY_KEY_ID"), keySecret = env("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json(req, 500, { error: "Payments aren't configured on the server." });

  const b = (await body(req)) || {};
  const orderId = String(b.razorpay_order_id || ""), paymentId = String(b.razorpay_payment_id || ""), signature = String(b.razorpay_signature || "");
  if (!orderId || !paymentId || !signature) return json(req, 400, { ok: false, error: "Missing payment fields." });

  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected, "utf8"), s = Buffer.from(signature, "utf8");
  if (a.length !== s.length || !crypto.timingSafeEqual(a, s)) return json(req, 400, { ok: false, error: "Payment couldn't be verified. If money left your account, contact support with your payment ID." });

  // Signature is valid: the payment really happened for this order. Issue the license to the order's email.
  let email = String(b.email || "").trim().toLowerCase();
  try {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await rzp.orders.fetch(orderId);
    if (order?.notes?.email) email = String(order.notes.email);
  } catch (e) {
    console.error("order lookup failed, falling back to client email:", e?.message);
  }
  const secret = env("AFTERIMAGE_SECRET");
  if (!secret || !EMAIL.test(email)) return json(req, 200, { ok: true, license: null, error: "Payment verified. Your key will be emailed to you shortly." });
  return json(req, 200, { ok: true, license: signLicense(email, secret), email });
}
