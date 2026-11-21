import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { BrowserSetup } from "./components/BrowserSetup.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { initTheme } from "./lib/theme.ts";
import "./styles.css";

// Follows the system theme (light when it can't be read) unless Settings holds an override.
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <BrowserSetup />
    </ErrorBoundary>
  </StrictMode>,
);
