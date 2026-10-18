import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

// Tauri only lets the webview call a command the ACL grants. Commands this app defines itself
// get no automatic entry (tauri-build autogenerates only core/plugin ones), and the dashboard is
// served by the sidecar over http://127.0.0.1, so it needs a remote-scoped capability that lists
// them. Getting that wrong fails only at runtime, as "Command check_update not allowed by ACL",
// which is why it is checked here instead.

const TAURI = resolve(import.meta.dirname, "..", "apps", "desktop", "src-tauri");

/** The commands the app registers with `generate_handler!`. */
function handlerCommands(): string[] {
  const src = readFileSync(join(TAURI, "src", "lib.rs"), "utf8");
  const list = src.match(/generate_handler!\[([^\]]+)\]/)?.[1];
  assert.ok(list, "generate_handler! not found in src/lib.rs");
  return list.split(",").map((c) => c.trim()).filter(Boolean);
}

/** identifier -> commands it allows, across every permissions/*.toml. */
function declaredPermissions(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const file of readdirSync(join(TAURI, "permissions")).filter((f) => f.endsWith(".toml"))) {
    const body = readFileSync(join(TAURI, "permissions", file), "utf8");
    for (const block of body.split("[[permission]]").slice(1)) {
      const id = block.match(/identifier\s*=\s*"([^"]+)"/)?.[1];
      const allow = block.match(/commands\.allow\s*=\s*\[([^\]]*)\]/)?.[1] ?? "";
      if (!id) continue;
      out.set(id, new Set(allow.split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean)));
    }
  }
  return out;
}

interface Capability {
  identifier: string;
  remote?: { urls?: string[] };
  permissions?: string[];
}

/** The capabilities whose origin covers the loopback URL the sidecar serves the dashboard on. */
function loopbackCapabilities(): Capability[] {
  const caps: Capability[] = [];
  for (const file of readdirSync(join(TAURI, "capabilities")).filter((f) => f.endsWith(".json"))) {
    const cap = JSON.parse(readFileSync(join(TAURI, "capabilities", file), "utf8")) as Capability;
    if (cap.remote?.urls?.some((u) => u.includes("127.0.0.1"))) caps.push(cap);
  }
  return caps;
}

test("a capability scoped to the loopback origin exists for the sidecar-served dashboard", () => {
  const caps = loopbackCapabilities();
  assert.ok(caps.length > 0, "no capability grants http://127.0.0.1:* — the dashboard runs there");
});

test("every app command is allowed for the dashboard's origin", () => {
  const commands = handlerCommands();
  assert.ok(commands.length > 0, "no commands found in generate_handler!");

  const permissions = declaredPermissions();
  const granted = new Set<string>();
  for (const cap of loopbackCapabilities()) {
    for (const id of cap.permissions ?? []) {
      for (const command of permissions.get(id) ?? []) granted.add(command);
    }
  }

  const missing = commands.filter((c) => !granted.has(c));
  assert.deepEqual(
    missing,
    [],
    `not allowed by ACL for http://127.0.0.1:* — add a permission in src-tauri/permissions/ and list it in the loopback capability`,
  );
});

test("every app permission listed by the loopback capability is actually declared", () => {
  const permissions = declaredPermissions();
  for (const cap of loopbackCapabilities()) {
    for (const id of cap.permissions ?? []) {
      // Plugin-qualified ids (core:default) come from the plugin, not from permissions/.
      if (id.includes(":")) continue;
      assert.ok(permissions.has(id), `capability "${cap.identifier}" lists unknown permission "${id}"`);
    }
  }
});