import { inject } from "@vercel/analytics";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
// Fonts are self-hosted from @fontsource-variable. The site used to pull four families from
// Google Fonts over a render-blocking stylesheet with two preconnects; on a mobile connection
// that is the difference between an LCP of one second and one of three.
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/schibsted-grotesk/wght-italic.css";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { App } from "./App.tsx";
import { trackGithubClicks } from "./analytics.ts";
import "./styles.css";

inject();
trackGithubClicks();

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
