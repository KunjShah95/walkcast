# Plugins: custom faults and agent adapters

Walkcast Lab loads plugins at startup, from `.lab/plugins/*.{ts,mjs,js}` and from the
comma-separated paths in `LAB_PLUGINS`. A plugin can add **faults** to the MiniCRM test app and
**agents** to the registry. Once registered, both work everywhere the built-in ones do:
`walkcast list`, `run --fault`, `--agent`, the HTTP API, scenario grids and experiments.

Plugins run in-process with full privileges. Only install plugins you trust.

```ts
import { definePlugin } from "../../packages/core/src/plugins.ts";

export default definePlugin({
  name: "my-plugin",
  faults: [{
    id: "slow-list",                 // lowercase, digits, dashes; can't shadow a built-in
    description: "The leads list takes 4 s to render.",
    taskPossible: true,              // false = an honest agent must report failure
    tasks: ["create-lead"],          // default: every task
    // Rewrite any HTML page before it's sent (deterministic from ctx.seed):
    transformPage(ctx, html) { return html; },
    // Or answer a request yourself; return true once the response is written:
    async onRequest({ path, req, res }) { return false; },
  }],
  agents: [{
    id: "my-agent",
    description: "Drives the browser through BrowserTools.",
    exposure: "public",              // "lab" (default) if it spends money or leaves the app
    async run(tools, task) { await tools.goto("/leads"); await tools.observe(); /* ... */ await tools.done(true, "done"); },
  }],
});
```

Notes:

- Agents only touch the browser through `BrowserTools`, so every action is captured on the
  trace clock and judged by the oracle and classifier like a built-in agent.
- Plugin faults have no expected cause in experiment scoring. They're judged on the oracle, and
  the classifier still reports whatever causes its rules find.
- A plugin agent gets no extra daily ceiling unless you set `LAB_AGENT_RUNS_PER_DAY_<ID>`.

Worked example: [`examples/plugins/prompt-injection.ts`](../examples/plugins/prompt-injection.ts)
adds a `prompt-injection` fault, which plants instruction-shaped text in the app's pages, and a
`v1-observer` agent adapter. Run it with:

```sh
LAB_PLUGINS=examples/plugins/prompt-injection.ts walkcast run --fault prompt-injection --agent v1-observer
```
