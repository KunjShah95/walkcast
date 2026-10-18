import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type FaultPlugin, registerFault } from "./app/faults.ts";
import { type PluginAgentSpec, registerAgent } from "./agents/registry.ts";
import { log } from "./ops/log.ts";

/**
 * Plugin API: custom faults for the MiniCRM app and custom agent adapters, without forking.
 *
 * A plugin is an ES module (.ts, .mjs or .js) whose default export (or `plugin` export) is:
 *
 *   export default {
 *     name: "my-plugin",
 *     faults: [{ id: "slow-save", description: "...", taskPossible: true, transformPage, onRequest }],
 *     agents: [{ id: "my-agent", description: "...", run: async (tools, task) => { ... } }],
 *   } satisfies WalkcastPlugin;
 *
 * Plugins are loaded from `<root>/.lab/plugins/` and from the comma-separated LAB_PLUGINS paths.
 * They run in-process with full privileges: only install plugins you trust. Plugin faults and
 * agents then show up everywhere built-ins do (`list`, `run --fault`, the API, experiments).
 */
export interface WalkcastPlugin {
  name: string;
  faults?: FaultPlugin[];
  agents?: Omit<PluginAgentSpec, "kind">[];
}

export function definePlugin(p: WalkcastPlugin): WalkcastPlugin {
  return p;
}

export function registerPlugin(p: WalkcastPlugin): void {
  for (const f of p.faults ?? []) registerFault(f);
  for (const a of p.agents ?? []) registerAgent(a);
}

const loaded = new Set<string>();

/** Load every plugin once per process. Returns the names loaded by this call. */
export async function loadPlugins(root: string, extra = process.env.LAB_PLUGINS ?? ""): Promise<string[]> {
  const files: string[] = [];
  const dir = join(root, ".lab", "plugins");
  if (existsSync(dir)) for (const f of readdirSync(dir).sort()) if (/\.(m?js|ts)$/.test(f) && !f.endsWith(".d.ts")) files.push(join(dir, f));
  for (const p of extra.split(",").map((s) => s.trim()).filter(Boolean)) files.push(isAbsolute(p) ? p : resolve(root, p));
  const names: string[] = [];
  for (const file of files) {
    if (loaded.has(file)) continue;
    loaded.add(file);
    try {
      const mod = (await import(pathToFileURL(file).href)) as { default?: WalkcastPlugin; plugin?: WalkcastPlugin };
      const plugin = mod.default ?? mod.plugin;
      if (!plugin || typeof plugin !== "object" || typeof plugin.name !== "string") throw new Error("no default export with a `name`");
      registerPlugin(plugin);
      names.push(plugin.name);
      log.info("plugin.loaded", { name: plugin.name, file, faults: (plugin.faults ?? []).map((f) => f.id), agents: (plugin.agents ?? []).map((a) => a.id) });
    } catch (e) {
      log.error("plugin.failed", { file, error: e instanceof Error ? e.message : String(e) });
      throw new Error(`Could not load plugin ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return names;
}
