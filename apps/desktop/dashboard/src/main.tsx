import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { BrowserSetup } from "./components/BrowserSetup.tsx";
import { initTheme } from "./lib/theme.ts";
import "./styles.css";

// Follows the system theme (light when it can't be read) unless Settings holds an override.
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <BrowserSetup />
  </StrictMode>,
);
