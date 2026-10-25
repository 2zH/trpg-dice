import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const DiceDesk = lazy(()=>import("./DiceDesk.js"));
createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<p className="loading">正在摆好骰子…</p>}><DiceDesk /></Suspense>
);
