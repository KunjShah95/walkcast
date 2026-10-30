import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { LengthPicker, VoicePicker, lengthLabel } from "../components/Studio.tsx";
import { TtsPicker } from "../components/TtsPicker.tsx";
import { PageHead, Panel, PanelHeader, Stamp } from "../components/ui.tsx";
import { Updates } from "../components/Updates.tsx";
import { type Capabilities, type Me, type Voice, isSnapshot, loadCapabilities } from "../lib/api.ts";
import { usePrefs, type TtsProvider } from "../lib/prefs.ts";
import { useI18n, LANGS } from "../lib/i18n.tsx";

/** Account, recording defaults, connected providers, and what the day allows. */
export function Settings({ me }: { me: Me | null }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  // Bumped when a key is saved, so the voice picker and the provider list re-read what's configured.
  const [keysVersion, setKeysVersion] = useState(0);
  const [prefs, setPrefs] = usePrefs();
  const { t, lang, setLang } = useI18n();
  useEffect(() => {
    if (!isSnapshot) void loadCapabilities().then(setCaps);
  }, []);

  return (
    <div className="grid max-w-[900px] gap-6">
      <PageHead title={t("settings.title")} dim={t("settings.dim")} description={t("settings.description")} />

      <Panel>
        <PanelHeader eyebrow={t("language")} title={t("language")} />
        <div className="grid gap-2 px-4 py-4">
          <p className="text-[12.5px] text-ink-3">{t("language.help")}</p>
          <select value={lang} onChange={(e) => setLang(e.target.value as "en" | "hi" | "ta" | "te")} className="h-9 max-w-md rounded-lg border border-line bg-panel px-3 text-[13px]">
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.native} ({l.label})</option>
            ))}
          </select>
        </div>
      </Panel>

      <Account me={me} />

      <Updates />

      <Panel>
        <PanelHeader eyebrow="Desktop app" title="Download Walkcast" aside={<span className="font-mono text-[11.5px] text-ink-3">lightweight Tauri build</span>} />
        <div className="grid gap-4 px-4 py-4">
          <p className="text-[13px] text-ink-2">
            A small native window for the signed-in app only. It uses your system's built-in webview, so there is no bundled browser and the installer stays a couple of megabytes.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="https://github.com/KunjShah95/walkcast/releases/latest" target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
              Windows (.exe / MSI)
            </a>
            <a href="https://github.com/KunjShah95/walkcast/releases/latest" target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
              Linux (.AppImage / .deb)
            </a>
          </div>
          <p className="text-[12px] text-ink-3">Prebuilt installers are published as GitHub release assets. To build locally instead, run <code className="font-mono">npx tauri build</code> after <code className="font-mono">npm run ui:build</code>.</p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="New recordings" title="Recording defaults" />
        <div className="grid gap-4 px-4 py-4">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">Narration voice</span>
            <p className="text-[12.5px] text-ink-3">Used for every new walkthrough. You can change it per recording afterwards.</p>
            <div className="mt-1 grid max-w-md gap-3">
              <TtsPicker
                key={keysVersion}
                provider={prefs.ttsProvider}
                voice={prefs.ttsVoices[prefs.ttsProvider] ?? ""}
                language={prefs.ttsLanguages[prefs.ttsProvider] ?? ""}
                selectClassName="h-9 w-full rounded-lg border border-line bg-panel px-3 text-[13px]"
                onProvider={(ttsProvider: TtsProvider) => setPrefs({ ttsProvider })}
                onVoice={(v) => setPrefs({ ttsVoices: { ...prefs.ttsVoices, [prefs.ttsProvider]: v } })}
                onLanguage={(l) => setPrefs({ ttsLanguages: { ...prefs.ttsLanguages, [prefs.ttsProvider]: l } })}
                localVoicePicker={<VoicePicker value={prefs.voice} onChange={(voice: Voice) => setPrefs({ voice })} available={caps?.voices?.available ?? false} />}
              />
              <p className="text-[12.5px] text-ink-3">Cloud providers need their API key in this server's settings. Without one, Kokoro gives a natural offline voice; the basic offline voice (robotic) and no voice are still there too.</p>
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Pages to visit · {prefs.maxPages}</span>
            <input
              type="range"
              min={1}
              max={30}
              value={prefs.maxPages}
              onChange={(e) => setPrefs({ maxPages: Number(e.target.value) })}
              className="max-w-md"
            />
          </label>
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">Length · {lengthLabel(prefs.maxSeconds)}</span>
            <LengthPicker value={prefs.maxSeconds} onChange={(maxSeconds) => setPrefs({ maxSeconds })} />
            <p className="text-[12.5px] text-ink-3">How long a new walkthrough may run before it stops at the next whole page.</p>
          </div>
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={prefs.captions} onChange={(e) => setPrefs({ captions: e.target.checked })} />
            <span>Show captions on the video player by default.</span>
          </label>
          <p className="text-[12px] text-ink-3">Kept in this browser only.</p>
        </div>
      </Panel>

      {!isSnapshot && <CustomVoices />}
      {!isSnapshot && (
        <Credentials
          onChange={() => {
            setKeysVersion((v) => v + 1);
            void loadCapabilities().then(setCaps);
          }}
        />
      )}
      {caps && <Providers caps={caps} />}
      {caps && <Usage caps={caps} />}
    </div>
  );
}

function Account({ me }: { me: Me | null }) {
  const next = encodeURIComponent("/app#settings");
  if (isSnapshot) {
    return (
      <Panel>
        <PanelHeader eyebrow="Account" title="Snapshot" />
        <p className="px-4 py-4 text-[13px] text-ink-2">
          This is an exported snapshot, so there is no account to manage. Run <code className="font-mono">npm run ui</code> to sign in.
        </p>
      </Panel>
    );
  }
  if (!me?.user) {
    return (
      <Panel>
        <PanelHeader eyebrow="Account" title="Not signed in" />
        <div className="grid gap-3 px-4 py-4">
          <p className="text-[13px] text-ink-2">Sign in to keep your walkthroughs and lab runs tied to your account.</p>
          <div className="flex flex-wrap gap-2">
            <a href={`/login?next=${next}`} className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
              Sign in
            </a>
            <a href={`/signup?next=${next}`} className="rounded-full bg-solid px-4 py-2 text-[13.5px] font-medium text-on-solid hover:brightness-95">
              Create account
            </a>
          </div>
        </div>
      </Panel>
    );
  }

  // "Not connected" and "this server doesn't offer it" are different states. The server turns
  // OpenRouter and ChatGPT off under Supabase (server.ts forces them false), but the panel still
  // rendered a Connect button, and following it replaced the whole dashboard with a bare JSON
  // 503 from the generic error handler.
const links: { label: string; connected: boolean; available: boolean; href: string }[] = [
    { label: "Google", connected: Boolean(me.user.google ?? me.google), available: me.google !== false, href: "/auth/google" },
    { label: "OpenRouter", connected: Boolean(me.user.openrouter ?? me.openrouter), available: me.openrouter !== false, href: "/auth/openrouter" },
    { label: "ChatGPT", connected: Boolean(me.user.chatgpt ?? me.chatgpt), available: me.chatgpt !== false, href: "/auth/chatgpt" },
  ];
  return (
    <Panel>
      <PanelHeader
        eyebrow="Account"
        title={me.user.name || me.user.email}
        aside={<span className="font-mono text-[11.5px] text-ink-3">{me.user.email}</span>}
      />
      <div className="grid gap-4 px-4 py-4">
        <div>
          <div className="mb-2 text-[13px] font-medium">Connected sign-ins</div>
          <ul className="grid gap-1.5 sm:grid-cols-3">
            {links.map(({ label, connected, available, href }) => (
              <li key={label}>
                {connected ? (
                  <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-[13px]">
                    <span className="size-1.5 rounded-full bg-pass" aria-hidden />
                    {label}
                    <span className="ml-auto text-[12px] text-ink-3">Connected</span>
                  </span>
                ) : available ? (
                  <a href={href} className="flex h-9 items-center rounded-lg border border-line px-3 text-[13px] text-ink-2 hover:border-line-strong hover:bg-panel-2 hover:text-ink">
                    Connect {label}
                  </a>
                ) : (
                  <span className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-ink-3" title={`${label} sign-in is not available on this server.`}>
                    {label}
                    <span className="ml-auto text-[12px]">Unavailable</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!me.authRequired && <p className="mt-2 text-[12px] text-ink-3">Accounts are off on this server, so everyone here sees the same lab.</p>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[12.5px] text-ink-3">Signed in{me.provider ? ` via ${me.provider}` : ""}.</span>
          <form method="post" action="/auth/logout">
            <button type="submit" className="cursor-pointer rounded-full border border-line-strong px-3.5 py-1.5 text-[13px] text-ink-2 hover:bg-panel-2 hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </Panel>
  );
}

/** How a provider has answered live calls in the last day, as /api/metrics reports it (llm/health.ts). */
interface ProviderHealth {
  provider: string;
  calls: number;
  failures: number;
  errorRate: number;
  p95Ms: number | null;
  state: "ok" | "degraded" | "down" | "idle";
  lastError: { at: string; status: number | null; message: string } | null;
}

function useProviderHealth(): ProviderHealth[] {
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  useEffect(() => {
    if (isSnapshot) return;
    let live = true;
    // Health is a nicety: a server that cannot say leaves the list as it was.
    fetch(`/api/metrics?windowMs=${86_400_000}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { providers?: ProviderHealth[] } | null) => live && m?.providers && setHealth(m.providers))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return health;
}

function HealthStamp({ h }: { h: ProviderHealth | undefined }) {
  if (!h) return <span className="text-[12.5px] text-pass">Configured</span>;
  const pct = `${Math.round(h.errorRate * 100)}% of ${h.calls} calls failing`;
  if (h.state === "down") return <span title={h.lastError?.message}><Stamp tone="fail">Down · {pct}</Stamp></span>;
  if (h.state === "degraded") return <span title={h.lastError?.message}><Stamp tone="warn">Degraded · {pct}</Stamp></span>;
  return <span className="text-[12.5px] text-pass">Healthy · {h.calls} calls{h.p95Ms !== null ? ` · p95 ${(h.p95Ms / 1000).toFixed(1)} s` : ""}</span>;
}

function Providers({ caps }: { caps: Capabilities }) {
  const health = useProviderHealth();
  // Configured providers, plus any that answered (or failed) a live call in the last day.
  const ids = [...new Set([...(caps.providers ?? []), ...health.map((h) => h.provider)])];
  const budgets = (caps.agents ?? []).filter((a) => a.budget && a.kind !== "scripted");
  if (ids.length === 0 && budgets.length === 0) return null;
  return (
    <Panel>
      <PanelHeader eyebrow="Lab runs" title="Model providers" aside={health.length > 0 ? <span className="text-[12px] text-ink-3">Last 24 hours</span> : undefined} />
      {ids.length > 0 && (
        <ul className="divide-y divide-line">
          {ids.map((id) => (
            <li key={id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
              <span className="font-mono">{id}</span>
              <HealthStamp h={health.find((h) => h.provider === id)} />
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 py-2.5 text-[12px] text-ink-3">{caps.liveModels ? "Live model runs are allowed here." : "Live model runs are disabled on this server."}</p>
      {budgets.length > 0 && (
        <p className="px-4 pb-2.5 text-[12px] text-ink-3">
          One live run may spend up to{" "}
          {budgets.map((a) => `${a.budget!.tokens === null ? "any number of" : a.budget!.tokens!.toLocaleString("en-US")} tokens${a.budget!.usd === null ? "" : ` (~$${a.budget!.usd!.toFixed(2)})`}`).join(", ")}. A run that reaches the ceiling stops and says so.
        </p>
      )}
    </Panel>
  );
}

interface CredKey { env: string; label: string; group: string; set: boolean }

interface CredTest { ok: boolean; message: string }

function Credentials({ onChange }: { onChange: () => void }) {
  const [keys, setKeys] = useState<CredKey[]>([]);
  const [editable, setEditable] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  // What the provider said about each key: saved is not the same as accepted.
  const [tests, setTests] = useState<Record<string, CredTest>>({});

  // The keys grouped by what they are for, so the panel reads as three short lists rather than
  // one long one.
  const groups = useMemo(() => {
    const order = ["Model", "Voice", "Storage"];
    const byGroup = new Map<string, CredKey[]>();
    for (const k of keys) byGroup.set(k.group, [...(byGroup.get(k.group) ?? []), k]);
    return order.filter((g) => byGroup.has(g)).map((g) => [g, byGroup.get(g)!] as const);
  }, [keys]);

  async function load() {
    try {
      const res = await fetch("/api/credentials");
      if (!res.ok) return;
      const body = (await res.json()) as { keys: CredKey[]; editable?: boolean };
      setKeys(body.keys ?? []);
      setEditable(body.editable ?? true);
    } catch { /* ignore */ }
  }
  useEffect(() => { void load(); }, []);

  async function test(env: string) {
    setTesting(env);
    try {
      const res = await fetch("/api/credentials/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env }) });
      const body = (await res.json().catch(() => ({}))) as Partial<CredTest> & { error?: string };
      setTests((t) => ({ ...t, [env]: res.ok ? { ok: Boolean(body.ok), message: body.message ?? "" } : { ok: false, message: body.error ?? `Test failed (${res.status})` } }));
    } catch (e) {
      setTests((t) => ({ ...t, [env]: { ok: false, message: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setTesting(null);
    }
  }

  async function save(env: string) {
    // A blank box on a saved key means "keep it", as the placeholder says, not "delete it".
    if (!(values[env] ?? "").trim() && keys.find((k) => k.env === env)?.set) return setStatus(`${env}: unchanged. Use Remove to delete it.`);
    setSaving(env);
    setStatus(null);
    try {
      const res = await fetch("/api/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env, value: values[env] ?? "" }) });
      const body = (await res.json()) as { ok?: boolean; set?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      setStatus(`${env}: ${body.set ? "saved" : "cleared"}`);
      setValues((v) => ({ ...v, [env]: "" }));
      setTests((t) => {
        const { [env]: _gone, ...rest } = t;
        return rest;
      });
      await load();
      onChange();
      if (body.set) await test(env);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function remove(env: string) {
    setSaving(env);
    setStatus(null);
    try {
      const res = await fetch(`/api/credentials?env=${encodeURIComponent(env)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      setStatus(`${env}: removed`);
      setTests((t) => {
        const { [env]: _gone, ...rest } = t;
        return rest;
      });
      await load();
      onChange();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Panel>
      <PanelHeader eyebrow="Credentials" title="API keys" aside={<span className="font-mono text-[11.5px] text-ink-3">stored locally, never sent to the browser again</span>} />
      <div className="grid gap-2 px-4 py-4">
        <p className="text-[12.5px] text-ink-3">
          {editable
            ? "Enter API keys for cloud providers (TTS and LLM). Saved to this machine and applied immediately."
            : "These keys belong to the server, so only its operator can change them. They apply to every account here."}
        </p>
        {status && <p className="text-[12.5px] text-ink-2">{status}</p>}
        {groups.map(([group, groupKeys]) => (
          <section key={group} className="grid gap-2">
            <h3 className="eyebrow mt-1">{group}</h3>
            <ul className="grid gap-2">
              {groupKeys.map((k) => (
                <li key={k.env} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-center">
                  <span className="text-[12.5px]">
                    <span className="font-medium">{k.label}</span>
                    <span className="ml-2 font-mono text-[11px] text-ink-3">{k.env}</span>
                    {k.set && !tests[k.env] && <span className="ml-2 text-[11px] text-pass">saved</span>}
                    {tests[k.env] && <span className={`ml-2 text-[11px] ${tests[k.env]!.ok ? "text-pass" : "text-fail"}`}>{tests[k.env]!.ok ? "works" : "not working"}</span>}
                    {tests[k.env] && <span className={`mt-0.5 block text-[11.5px] ${tests[k.env]!.ok ? "text-ink-3" : "text-fail"}`}>{tests[k.env]!.message}</span>}
                  </span>
                  <input
                    type="password"
                    placeholder={k.set ? "•••••••• (leave blank to keep)" : "paste key"}
                    value={values[k.env] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [k.env]: e.target.value }))}
                    className="h-9 rounded-lg border border-line bg-panel px-3 text-[13px]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving === k.env}
                      onClick={() => void save(k.env)}
                      className="h-9 rounded-lg border border-line-strong px-3 text-[13px] hover:bg-panel-2 disabled:opacity-50"
                    >
                      {saving === k.env ? "Saving…" : testing === k.env ? "Testing…" : "Save"}
                    </button>
                    {k.set && (
                      <button
                        type="button"
                        disabled={testing === k.env || saving === k.env}
                        onClick={() => void test(k.env)}
                        className="h-9 rounded-lg border border-line px-3 text-[13px] hover:bg-panel-2 disabled:opacity-50"
                      >
                        Test
                      </button>
                    )}
                    {k.set && editable && (
                      <button
                        type="button"
                        disabled={saving === k.env}
                        onClick={() => void remove(k.env)}
                        className="h-9 rounded-lg px-2 text-[13px] text-ink-3 hover:text-fail disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

interface CustomVoice { id: string; name: string; url: string }

function CustomVoices() {
  const [voices, setVoices] = useState<CustomVoice[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/voices/custom");
      if (!res.ok) return;
      const body = (await res.json()) as { voices?: CustomVoice[] };
      setVoices(body.voices ?? []);
    } catch { /* ignore */ }
  }
  useEffect(() => { void load(); }, []);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/voices/custom", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": file.name },
        body: file,
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      setStatus(`Uploaded ${file.name}`);
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/voices/custom/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Panel>
      <PanelHeader eyebrow="Custom voices" title="Uploaded voice samples" aside={<span className="font-mono text-[11.5px] text-ink-3">stored under data/voices/</span>} />
      <div className="grid gap-3 px-4 py-4">
        <p className="text-[12.5px] text-ink-3">Upload an audio sample to use as narration fallback with the "Custom voice" provider.</p>
        {status && <p className="text-[12.5px] text-ink-2">{status}</p>}
        <input type="file" accept="audio/*" disabled={uploading} onChange={(e) => void upload(e)} className="text-[13px]" />
        {voices.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">No custom voices uploaded yet.</p>
        ) : (
          <ul className="grid gap-2">
            {voices.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px]">
                <span className="truncate">{v.name}</span>
                <div className="flex gap-2">
                  <audio src={v.url} controls className="h-8" />
                  <button type="button" onClick={() => void remove(v.id)} className="rounded-lg border border-line-strong px-3 text-[12px] hover:bg-panel">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function Usage({ caps }: { caps: Capabilities }) {
  const limits = caps.limits;
  if (!limits) return null;
  if (caps.jobsUnavailable) {
    return (
      <Panel>
        <PanelHeader eyebrow="Usage" title="Limits" />
        <p className="px-4 py-4 text-[13px] text-fail">{caps.jobsUnavailable}</p>
      </Panel>
    );
  }
  const rows: [string, string][] = [
    ["Walkthroughs today", `${caps.usage?.recordingsToday ?? 0} / ${limits.recordingsPerDay}`],
    ["Jobs in flight", `${caps.running ? 1 : 0} / ${limits.activeJobsPerUser}`],
    ["Waiting in queue", caps.queue == null ? "—" : String(caps.queue)],
  ];
  return (
    <Panel>
      <PanelHeader eyebrow="Usage" title="Today" aside={<span className="font-mono text-[11.5px] text-ink-3">resets in 24h</span>} />
      <dl className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-[13px] text-ink-2">{k}</dt>
            <dd className="font-mono text-[12.5px]">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}