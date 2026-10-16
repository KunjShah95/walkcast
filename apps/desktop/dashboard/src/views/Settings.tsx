import { useEffect, useState } from "react";
import { VoicePicker } from "../components/Studio.tsx";
import { PageHead, Panel, PanelHeader } from "../components/ui.tsx";
import { type Capabilities, type Me, type Voice, isSnapshot, loadCapabilities } from "../lib/api.ts";
import { usePrefs } from "../lib/prefs.ts";

/** Account, recording defaults, connected providers, and what the day allows. */
export function Settings({ me }: { me: Me | null }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [prefs, setPrefs] = usePrefs();
  useEffect(() => {
    if (!isSnapshot) void loadCapabilities().then(setCaps);
  }, []);

  return (
    <div className="grid max-w-[900px] gap-6">
      <PageHead title="Your" dim="settings." description="Your account, how new walkthroughs are recorded, and what this deployment can do." />

      <Account me={me} />

      <Panel>
        <PanelHeader eyebrow="Desktop app" title="Download Walkcast" aside={<span className="font-mono text-[11.5px] text-ink-3">lightweight Tauri build</span>} />
        <div className="grid gap-4 px-4 py-4">
          <p className="text-[13px] text-ink-2">
            A small native window for the signed-in app only. It uses your system's built-in webview, so there is no bundled browser and the installer stays a couple of megabytes.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="https://github.com/KunjShah95/browser-user/releases/latest" target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
              Windows (.exe / MSI)
            </a>
            <a href="https://github.com/KunjShah95/browser-user/releases/latest" target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
              macOS (.dmg / app)
            </a>
            <a href="https://github.com/KunjShah95/browser-user/releases/latest" target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
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
            <div className="mt-1">
              <VoicePicker value={prefs.voice} onChange={(voice: Voice) => setPrefs({ voice })} available={caps?.voices?.available ?? false} />
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
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={prefs.captions} onChange={(e) => setPrefs({ captions: e.target.checked })} />
            <span>Show captions on the video player by default.</span>
          </label>
          <p className="text-[12px] text-ink-3">Kept in this browser only.</p>
        </div>
      </Panel>

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

  const links: [string, boolean | undefined, string][] = [
    ["Google", me.user.google ?? me.google, "/auth/google"],
    ["OpenRouter", me.user.openrouter ?? me.openrouter, "/auth/openrouter"],
    ["ChatGPT", me.user.chatgpt ?? me.chatgpt, "/auth/chatgpt"],
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
            {links.map(([label, connected, href]) => (
              <li key={label}>
                {connected ? (
                  <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-[13px]">
                    <span className="size-1.5 rounded-full bg-pass" aria-hidden />
                    {label}
                    <span className="ml-auto text-[12px] text-ink-3">Connected</span>
                  </span>
                ) : (
                  <a href={href} className="flex h-9 items-center rounded-lg border border-line px-3 text-[13px] text-ink-2 hover:border-line-strong hover:bg-panel-2 hover:text-ink">
                    Connect {label}
                  </a>
                )}
              </li>
            ))}
          </ul>
          {!me.authRequired && <p className="mt-2 text-[12px] text-ink-3">Accounts are off on this server, so everyone here sees the same lab.</p>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[12.5px] text-ink-3">Signed in{me.provider ? ` via ${me.provider}` : ""}.</span>
          <a href="/auth/logout" className="rounded-full border border-line-strong px-3.5 py-1.5 text-[13px] text-ink-2 hover:bg-panel-2 hover:text-ink">
            Sign out
          </a>
        </div>
      </div>
    </Panel>
  );
}

function Providers({ caps }: { caps: Capabilities }) {
  const ids = caps.providers ?? [];
  if (ids.length === 0) return null;
  return (
    <Panel>
      <PanelHeader eyebrow="Lab runs" title="Model providers" />
      <ul className="divide-y divide-line">
        {ids.map((id) => (
          <li key={id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
            <span className="font-mono">{id}</span>
            <span className="text-[12.5px] text-pass">Configured</span>
          </li>
        ))}
      </ul>
      <p className="px-4 py-2.5 text-[12px] text-ink-3">{caps.liveModels ? "Live model runs are allowed here." : "Live model runs are disabled on this server."}</p>
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