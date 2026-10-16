import { renderToString } from "react-dom/server";
import { App } from "./App.tsx";

/** The landing page as HTML, written into index.html at build time so crawlers read it. */
export function render(): string {
  return renderToString(<App />);
}
