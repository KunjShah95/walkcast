import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { BrowserSetup } from "./components/BrowserSetup.tsx";
import "./styles.css";

try {
  const saved = localStorage.getItem("lab-theme");
  if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  else document.documentElement.setAttribute("data-theme", "dark");
} catch {
  /* storage unavailable: follow the system theme */
  document.documentElement.setAttribute("data-theme", "dark");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <BrowserSetup />
  </StrictMode>,
);
