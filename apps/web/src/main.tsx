import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

const root = document.getElementById("root")!;
const path = location.pathname.replace(/\/+$/, "") || "/";
const app = (
  <StrictMode>
    <App path={path} />
  </StrictMode>
);
// The production build ships every page prerendered (build.ts); the dev server does not.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
