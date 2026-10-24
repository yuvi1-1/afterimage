import { createRoot } from "react-dom/client";
import App from "./App";
import { freshLook } from "./lib/looks";
import "./styles.css";

// Deep links: ?scene=relic&pal=frost&mode=1 open straight into a look.
const q = new URLSearchParams(location.search);
if (q.get("scene")) {
  const scene = q.get("scene")!;
  try { localStorage.setItem("afterimage.look.v1", JSON.stringify({ ...freshLook(scene, q.get("pal") || "gold"), modes: { [scene]: +(q.get("mode") || 0) } })); } catch { /* ignore */ }
}

if (/Electron/.test(navigator.userAgent) && /Mac/.test(navigator.platform)) document.documentElement.classList.add("mac-app");

createRoot(document.getElementById("root")!).render(<App />);
