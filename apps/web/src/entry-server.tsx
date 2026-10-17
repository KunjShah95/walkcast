import { renderToString } from "react-dom/server";
import { App } from "./App.tsx";

/** A page as HTML, written into dist/web at build time so crawlers read it without JavaScript. */
export function render(path: string): string {
  return renderToString(<App path={path} />);
}
