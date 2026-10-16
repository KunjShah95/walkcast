/**
 * Stands in for `playwright` and `@browserbasehq/stagehand` in the Vercel Function bundle. The
 * function never runs a browser (it has no worker), but the server imports the job code that
 * does; bundling the real packages would pull in browser downloads they can't use there.
 */
function unavailable(): never {
  throw new Error("No browser in this deployment: recordings and lab runs need `npm run dev` or `lab worker`.");
}

export const chromium = new Proxy({}, { get: unavailable });
export class Stagehand {
  constructor() {
    unavailable();
  }
}
export const localBrowser = unavailable;
