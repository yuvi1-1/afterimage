/** Razorpay Standard Checkout. The server creates the order and verifies the signature; the browser only opens the modal. */

const KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;
/** Base URL of the payment API. Empty means same origin (the Netlify site, or `npm run dev`). */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || "").replace(/\/$/, "");

/** The desktop app and GitHub Pages need an explicit API host; a same-origin deploy doesn't. */
export const checkoutAvailable = !!KEY_ID && (!!API_BASE || !(location.hostname.endsWith("github.io") || location.protocol === "app:" || location.protocol === "file:"));

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (ev: string, cb: (r: { error: { description?: string; reason?: string } }) => void) => void };
declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => RazorpayInstance } }

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => res();
    s.onerror = () => { scriptPromise = null; rej(new Error("Couldn't load the payment window. Check your connection and try again.")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function post<T>(path: string, data: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  } catch {
    throw new Error("Couldn't reach the payment server. Check your connection and try again.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Payment server error (${r.status}).`);
  return j as T;
}

export type CheckoutResult = { status: "paid"; license: string | null; message?: string } | { status: "cancelled" };

/** Create an order, open the Razorpay modal, verify the payment on the server and return the license key. */
export async function buyPro(email: string): Promise<CheckoutResult> {
  const [order] = await Promise.all([
    post<{ order_id: string; amount: number; currency: string; key_id: string }>("/api/create-order", { email }),
    loadScript(),
  ]);
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.key_id || KEY_ID,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: "Afterimage",
      description: "Afterimage Pro license",
      prefill: { email },
      notes: { email },
      theme: { color: "#f2b544" },
      handler: async (resp: RazorpayResponse) => {
        try {
          const v = await post<{ ok: boolean; license: string | null; error?: string }>("/api/verify-payment", { ...resp, email });
          if (!v.ok) throw new Error(v.error || "Payment couldn't be verified.");
          resolve({ status: "paid", license: v.license, message: v.error });
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => resolve({ status: "cancelled" }), confirm_close: true },
    });
    rzp.on("payment.failed", (r) => reject(new Error(r.error?.description || "The payment failed. No money was taken; try again or use another method.")));
    rzp.open();
  });
}
