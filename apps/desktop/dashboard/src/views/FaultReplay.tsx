import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../App.tsx";
import { type NodeStatus, type Packet, Pipeline } from "../components/Pipeline.tsx";
import { ReplayFixture } from "../components/ReplayFixture.tsx";
import { Panel, PanelHeader, Verdict } from "../components/ui.tsx";
import { FAULT_INFO } from "../lib/agents.ts";
import { type Capabilities, SignInRequired, loadCapabilities, startRun } from "../lib/api.ts";
import { cn, faultLabel, ms } from "../lib/format.ts";
import { SCENARIOS, type Scenario, type ScenarioStep, scriptedStandIn } from "../lib/scenarios.ts";
import type { LabIndex, RunSummary } from "../lib/types.ts";

/**
 * Fault replay: a fixed library of failure scenarios that ship with the product.
 *
 * Every scenario carries its own explanation, timeline and scorecard, so the page is complete on a
 * workspace that has never recorded anything. When the server can record, the same scenario can be
 * run live in a real browser and the real timeline opened.
 */
export function FaultReplay({ index, go, refresh }: { index: LabIndex; go: (r: Route) => void; refresh?: () => Promise<LabIndex> }) {
  const scenarioId = useScenarioFromHash();
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;

  const [caps, setCaps] = useState<Capabilities>({ live: false });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [liveDir, setLiveDir] = useState<string | null>(null);

  useEffect(() => {
    loadCapabilities().then(setCaps);
  }, []);

  const pick = (id: string) => {
    try {
      history.replaceState(null, "", `${location.pathname}#simulator?scenario=${encodeURIComponent(id)}`);
      // replaceState does not fire hashchange; tell React ourselves.
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch {
      /* history unavailable */
    }
  };

  // A new scenario starts a new replay: drop the previous run's outcome.
  useEffect(() => {
    setLiveDir(null);
    setError(null);
  }, [scenarioId]);

  // One player for the whole page: the diagram and the transcript never disagree.
  const player = usePlayer(scenario.steps);

  // No Chrome or Edge here, so the model-driven agent can't start: play the scenario with the
  // scripted agent that reproduces it, instead of a button that always failed.
  const standIn = caps.live && caps.stagehand === false && scenario.stagehand ? scriptedStandIn(scenario) : null;

  const runLive = async () => {
    setRunning(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const dir = await startRun({
        agent: standIn ?? scenario.liveAgent,
        fault: scenario.faults.join("+"),
        seed: 1,
        task: scenario.liveTask,
        ...(!standIn && scenario.stagehand && !caps.providers?.length ? { modelMode: "scripted" } : {}),
      });
      setLiveDir(dir);
      void refresh?.();
    } catch (e) {
      setNeedsSignIn(e instanceof SignInRequired);
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="max-w-[74ch]">
        <div className="eyebrow">Fault replay</div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
          Watch a browser agent meet a broken app.
        </h1>
        <p className="mt-1 text-ink-2">
          Each scenario below is a real failure mode we replay on a diagram of the system: what breaks, what it costs you, and how an agent behaves
          when the app does not behave. Every verdict is checked against the application's own records, not against the agent's opinion of itself.
        </p>
        <p className="mt-2 text-[13px] text-ink-3">
          Use it in a sales call to show what the checks are worth, or on your own team to settle an argument about how an agent should behave.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="min-w-0">
          <PanelHeader eyebrow={`${SCENARIOS.length} scenarios`} title="Failure library" />
          <div className="grid gap-1.5 p-3" role="radiogroup" aria-label="Failure scenario">
            {SCENARIOS.map((s) => {
              const on = s.id === scenario.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(s.id)}
                  className={cn(
                    "grid gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    on ? "border-signal bg-signal-soft" : "border-line hover:border-ink-3",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-medium leading-snug">{s.title}</span>
                    <span className={cn("mt-px shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em]", s.verdict === "pass" ? "text-pass" : "text-fail")}>
                      {s.verdict === "pass" ? "handled" : "broken"}
                    </span>
                  </span>
                  <span className="text-[12px] leading-snug text-ink-2">{FAULT_INFO[s.faults[0] ?? ""]?.what ?? s.whatHappens}</span>
                </button>
              );
            })}
          </div>
          <p className="border-t border-line px-4 py-2.5 text-[12px] leading-relaxed text-ink-3">
            Every scenario here is a bundled reference, not something you have to set up first. New scenarios are added as we find real failures.
          </p>
        </Panel>

        <div className="grid min-w-0 gap-4">
          <ScenarioHead scenario={scenario} index={index} go={go} />

          <div className="grid gap-3 md:grid-cols-3">
            <Explain title="What breaks" body={scenario.whatHappens} />
            <Explain title="What it costs" body={scenario.risk} tone="fail" />
            <Explain title="What we require" body={scenario.trustworthy} tone="pass" />
          </div>

          <Replay scenario={scenario} player={player} />

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Narration steps={scenario.steps} player={player} />
            <ScorecardPanel scenario={scenario} />
          </div>

          <Panel>
            <PanelHeader
              eyebrow={caps.live ? "Runs a real browser against the demo app" : "Reference library"}
              title={caps.live ? "Run this one yourself" : "Take it further"}
              aside={
                caps.live ? (
                  <button
                    type="button"
                    onClick={runLive}
                    disabled={running}
                    title="Starts a real browser against the test app; about 30 seconds."
                    className="rounded-full bg-solid px-4 py-1.5 text-[13px] font-medium text-on-solid transition-colors hover:brightness-95 disabled:opacity-60"
                  >
                    {running ? "Running in a real browser…" : "Run it live (~30 s)"}
                  </button>
                ) : null
              }
            />
            {error && (
              <p className="border-b border-line px-4 py-3 text-[13px] text-fail">
                {error}{" "}
                {needsSignIn && (
                  <a className="font-medium underline" href={`/login?next=${encodeURIComponent("/app#simulator")}`}>
                    Sign in
                  </a>
                )}
              </p>
            )}
            {liveDir && (
              <p className="border-b border-line px-4 py-3 text-[13px] text-pass">
                Recorded. The real timeline has the per-request detail for this exact scenario.{" "}
                <button type="button" onClick={() => go({ view: "run", dir: liveDir })} className="font-medium underline">
                  Open the timeline
                </button>
              </p>
            )}
            <div className="grid gap-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              {caps.live ? (
                <p>
                  Running it live drives a real browser through the same task with the same fault injected. Nothing is simulated: the verdict comes from the
                  app's database, the same way it does in production.
                </p>
              ) : (
                <p>
                  This deployment records walkthroughs only. The scenario above is the complete story — the timeline, the check against the app's
                  records and the scorecard are all included.
                </p>
              )}
              {standIn && (
                <p className="text-ink-3">
                  The AI agent in this scenario needs Google Chrome or Microsoft Edge, and neither is installed here, so this runs Walkcast's built-in{" "}
                  {standIn === "v0" ? "naive" : "fixed"} agent ({standIn}) instead: same task, same fault, same check against the app's records. Install
                  Chrome or Edge and reopen Walkcast to run the AI agent.
                </p>
              )}
              <p className="text-[12.5px] text-ink-3">
                To put a scenario behind your own product instead of the demo app, record your own flow on the Record page and we will match it against
                these failure modes.
              </p>
            </div>
          </Panel>

          <FixtureReplays index={index} go={go} refresh={refresh} />
        </div>
      </div>
    </div>
  );
}

/**
 * The real failures this machine has, replayable from right here.
 *
 * The scenario above is a diagram: it explains the failure without running anything. A fixture
 * is the frozen failure itself — the app, the seed data, the timings — and replaying it runs the
 * real agent against it in a real browser. A browser agent needs Chrome or Edge, but it does not
 * need a model key when the fixture's recorded calls are replayed, so the page can try one
 * without either. That combination was unreachable: the fixture lived on another page, and the
 * model mode was chosen for the person.
 */
function FixtureReplays({ index, go, refresh }: { index: LabIndex; go: (r: Route) => void; refresh?: () => Promise<LabIndex> }) {
  const fixtures = index.fixtures ?? [];
  if (fixtures.length === 0) return null;
  return (
    <Panel>
      <PanelHeader eyebrow={`${fixtures.length} saved`} title="Replay a real failure" />
      <div className="grid gap-4 px-4 py-3">
        {fixtures.map((f) => (
          <div key={f.dir} className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline gap-2 text-[12.5px]">
              <span className="font-mono text-ink">{f.id}</span>
              <span className="text-ink-3">
                failed with {f.manifest.original.agent.id} · {faultLabel(f.manifest.environment.fault)}
              </span>
            </div>
            <ReplayFixture dir={f.dir} agent={f.manifest.original.agent.id} go={go} onDone={() => void refresh?.()} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ScenarioHead({ scenario, index, go }: { scenario: Scenario; index: LabIndex; go: (r: Route) => void }) {
  const recorded = useRecordedRun(scenario, index);
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="eyebrow">Scenario</div>
          <h2 className="font-display text-[20px] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">{scenario.title}</h2>
          <p className="mt-1 text-[13px] text-ink-2">{scenario.task}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-ink-2">{scenario.agentLabel}</span>
          <Verdict verdict={scenario.verdict} />
        </div>
      </div>
      <p className={cn("px-4 py-3 text-[14px] leading-relaxed", scenario.verdict === "pass" ? "text-pass" : "text-fail")}>{scenario.headline}</p>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <CopySummary scenario={scenario} />
        {recorded && (
          <button
            type="button"
            onClick={() => go({ view: "run", dir: recorded.dir })}
            className="rounded-full border border-line-strong px-4 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-signal hover:text-signal"
          >
            Open the recorded timeline
          </button>
        )}
      </div>
    </Panel>
  );
}

/** A plain-text version of the scenario, ready to paste into a ticket or an email. */
function summaryText(s: Scenario): string {
  return [
    `Scenario: ${s.title}`,
    `Task: ${s.task}`,
    `Outcome: ${s.headline}`,
    "",
    `What breaks: ${s.whatHappens}`,
    `What it costs: ${s.risk}`,
    `What we require: ${s.trustworthy}`,
    "",
    `Reliability score: ${s.score.total}/100 (${s.score.grade})`,
    ...s.score.lines.map((l) => `  · ${l.label}: ${l.points === null ? "n/a" : `${l.points}/20`} — ${l.why}`),
  ].join("\n");
}

function CopySummary({ scenario }: { scenario: Scenario }) {
  const [state, setState] = useState<"idle" | "copied">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(summaryText(scenario));
          setState("copied");
          setTimeout(() => setState("idle"), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-full border border-line-strong px-4 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-signal hover:text-signal"
    >
      {state === "copied" ? "Summary copied" : "Copy this summary"}
    </button>
  );
}

function Explain({ title, body, tone }: { title: string; body: string; tone?: "fail" | "pass" }) {
  return (
    <div className={cn("grid gap-1.5 rounded-xl border p-4", tone === "fail" ? "border-fail/30 bg-fail-soft" : tone === "pass" ? "border-pass/25 bg-pass-soft" : "border-line bg-panel")}>
      <div className={cn("eyebrow", tone === "fail" && "text-fail", tone === "pass" && "text-pass")}>{title}</div>
      <p className="text-[13px] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

/** The animated pipeline plus transport controls, driven by the scenario's own timeline. */
function Replay({ scenario, player }: { scenario: Scenario; player: Player }) {
  return (
    <Panel className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="eyebrow">Replay</div>
          <div className="text-[13px] text-ink-2">{scenario.task}</div>
        </div>
        <span className="font-mono text-[11px] text-ink-3">{ms(player.duration)}</span>
      </div>
      <div className="overflow-x-auto px-2 py-3">
        <Pipeline
          taskLabel={scenario.task}
          agentLabel={scenario.agentLabel}
          modelLabel={scenario.stagehand ? "model" : "none (scripted)"}
          stagehand={scenario.stagehand}
          faults={scenario.faults}
          status={player.status}
          packets={player.packets}
          highlight={null}
          onToggleFault={() => undefined}
        />
      </div>
      <p className="border-t border-line px-4 py-2 text-[12px] leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">How to read it:</span> left is the agent making its decisions; right is the app under test. Dots are
        requests travelling between them; a box turns amber or red at the moment something goes wrong. The <em>checker</em> reads the app's own database
        afterwards to check what the agent claimed.
      </p>
      <PlayerBar player={player} />
    </Panel>
  );
}

function ScorecardPanel({ scenario }: { scenario: Scenario }) {
  const { score } = scenario;
  const tone = score.total >= 71 ? "text-pass" : score.total >= 51 ? "text-warn" : "text-fail";
  return (
    <Panel className="min-w-0">
      <PanelHeader eyebrow="5 categories × 20 points" title="Reliability score" />
      <div className="grid gap-3 p-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className={cn("tabular font-display text-[44px] font-semibold leading-none", tone)}>{score.total}</div>
            <div className="font-mono text-[11px] text-ink-3">of 100</div>
          </div>
          <div className={cn("font-display text-xl font-semibold", tone)}>{score.grade}</div>
        </div>
        <ul className="grid gap-2.5">
          {score.lines.map((l) => (
            <li key={l.label} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-medium">{l.label}</span>
                <span className="tabular font-mono text-[12px] text-ink-2">{l.points === null ? "n/a" : `${l.points}/20`}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div
                  className={cn("h-full rounded-full", l.points === null ? "bg-line" : l.points >= 16 ? "bg-pass" : l.points >= 10 ? "bg-warn" : "bg-fail")}
                  style={{ width: `${((l.points ?? 0) / 20) * 100}%` }}
                />
              </div>
              <div className="text-[11.5px] leading-snug text-ink-2">{l.why}</div>
            </li>
          ))}
        </ul>
        <p className="border-t border-line pt-2 font-mono text-[10.5px] text-ink-3">
          Brittle &lt;31 · Fragile &lt;51 · Dependable &lt;71 · Robust &lt;86 · Production-ready 86+
        </p>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ playback

/** The scenario in the URL, so a link to one opens that one. */
function useScenarioFromHash(): string {
  const [id, setId] = useState(scenarioFromHash);
  useEffect(() => {
    const onHash = () => setId(scenarioFromHash());
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);
  return id;
}

function scenarioFromHash(): string {
  const want = new URLSearchParams(location.hash.split("?")[1] ?? "").get("scenario");
  return SCENARIOS.some((s) => s.id === want) ? want! : SCENARIOS[0]!.id;
}

interface Player {
  t: number;
  duration: number;
  playing: boolean;
  speed: number;
  status: Record<string, NodeStatus>;
  packets: Packet[];
  play(): void;
  pause(): void;
  seek(t: number): void;
  setSpeed(s: number): void;
  restart(autoplay?: boolean): void;
}

function usePlayer(steps: ScenarioStep[]): Player {
  const duration = steps.length ? steps[steps.length - 1]!.at + 400 : 0;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [packets, setPackets] = useState<Packet[]>([]);
  const nextId = useRef(0);
  const tRef = useRef(0);

  useEffect(() => {
    tRef.current = 0;
    setT(0);
    setPlaying(false);
    setPackets([]);
  }, [steps]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const prev = tRef.current;
      const next = Math.min(duration, prev + (now - last) * speed);
      last = now;
      const fired = steps.filter((s) => s.at > prev && s.at <= next);
      if (fired.length) {
        const fresh = fired.flatMap((s) => s.edges.map((edge) => ({ id: nextId.current++, edge, tone: s.tone })));
        setPackets((cur) => [...cur.slice(-24), ...fresh]);
      }
      tRef.current = next;
      setT(next);
      if (next >= duration) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, steps, duration]);

  const status = useMemo(() => {
    const s: Record<string, NodeStatus> = {};
    for (const step of steps) {
      if (step.at > t) break;
      for (const n of step.nodes) {
        if (step.tone === "fail") s[n] = "fail";
        else if (step.tone === "warn" && s[n] !== "fail") s[n] = "warn";
        else if (step.tone === "pass") s[n] = "pass";
        else if (!s[n] || s[n] === "active") s[n] = t - step.at < 500 ? "active" : (s[n] ?? "idle");
      }
    }
    return s;
  }, [steps, t]);

  return {
    t,
    duration,
    playing,
    speed,
    status,
    packets,
    play: () => {
      if (tRef.current >= duration) {
        tRef.current = 0;
        setT(0);
      }
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    seek: (v) => {
      tRef.current = v;
      setT(v);
    },
    setSpeed,
    restart: (autoplay = false) => {
      tRef.current = 0;
      setT(0);
      setPackets([]);
      setPlaying(autoplay);
    },
  };
}

function PlayerBar({ player }: { player: Player }) {
  const pct = player.duration ? (player.t / player.duration) * 100 : 0;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
      <button
        type="button"
        onClick={() => (player.playing ? player.pause() : player.play())}
        aria-label={player.playing ? "Pause" : "Play"}
        className="rounded-full bg-solid px-4 py-1.5 font-mono text-[12px] text-on-solid transition-colors hover:brightness-95"
      >
        {player.playing ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        onClick={() => player.restart(true)}
        aria-label="Restart"
        className="rounded-full border border-line-strong px-3 py-1 font-mono text-[12px] text-ink-2 hover:text-signal"
      >
        Restart
      </button>
      <button
        type="button"
        onClick={() => player.seek(player.duration)}
        aria-label="Skip to the result"
        className="rounded-full border border-line-strong px-3 py-1 font-mono text-[12px] text-ink-2 hover:text-signal"
      >
        End
      </button>
      <label htmlFor="replay-scrub" className="sr-only">
        Position
      </label>
      <input
        id="replay-scrub"
        type="range"
        min={0}
        max={Math.max(1, player.duration)}
        value={player.t}
        onChange={(e) => player.seek(Number(e.target.value))}
        className="h-1.5 min-w-40 flex-1 accent-[var(--signal)]"
        style={{ background: `linear-gradient(to right, var(--signal) ${pct}%, var(--line) ${pct}%)` }}
      />
      <span className="tabular w-28 text-right font-mono text-[12px] text-ink-2">
        {ms(player.t)} / {ms(player.duration)}
      </span>
      <div className="inline-flex rounded-full bg-panel-2 p-0.5" role="radiogroup" aria-label="Playback speed">
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={player.speed === s}
            onClick={() => player.setSpeed(s)}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2.5 py-0.5 font-mono text-[11.5px] transition-colors",
              player.speed === s ? "bg-solid text-on-solid" : "text-ink-2 hover:text-ink",
            )}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function Narration({ steps, player }: { steps: ScenarioStep[]; player: Player }) {
  const current = steps.reduce((idx, s, i) => (s.at <= player.t ? i : idx), -1);
  const [speak, setSpeak] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[current] as HTMLElement | undefined;
    if (list && item) list.scrollTop = Math.max(0, item.offsetTop - list.clientHeight / 2);
  }, [current]);

  useEffect(() => {
    if (canSpeak && (!player.playing || !speak)) window.speechSynthesis.cancel();
  }, [player.playing, speak, canSpeak]);

  useEffect(() => {
    if (!speak || !player.playing || current < 0 || !canSpeak) return;
    const text = steps[current]?.text;
    if (!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.08;
    window.speechSynthesis.speak(u);
  }, [current, speak, player.playing, steps, canSpeak]);

  useEffect(() => () => (canSpeak ? window.speechSynthesis.cancel() : undefined), [canSpeak]);

  return (
    <Panel className="min-w-0">
      <PanelHeader
        eyebrow="What happened, moment by moment"
        title="Narration"
        aside={
          <>
            {canSpeak && (
              <button
                type="button"
                onClick={() => setSpeak((s) => !s)}
                aria-pressed={speak}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                  speak ? "border-signal text-signal" : "border-line-strong text-ink-2 hover:text-ink",
                )}
              >
                {speak ? "Speaking" : "Speak"}
              </button>
            )}
            <button
              type="button"
              onClick={() => player.restart(true)}
              aria-label="Replay from the start"
              className="rounded-full border border-line-strong px-3 py-1 text-[12.5px] text-ink-2 hover:border-signal hover:text-signal"
            >
              Replay
            </button>
          </>
        }
      />
      <ol ref={listRef} className="relative max-h-[340px] overflow-y-auto px-2 py-2">
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
              i === current ? "bg-panel-2" : i > current ? "opacity-45" : "",
              s.tone === "fail" && i <= current && "text-fail",
              s.tone === "pass" && i <= current && "text-pass",
              s.tone === "warn" && i <= current && "text-warn",
            )}
          >
            <span className="tabular pt-px font-mono text-[11px] text-ink-3">{ms(s.at)}</span>
            <span className="[overflow-wrap:anywhere]">{s.text}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/** The recorded run for this scenario, when the workspace has one for it. */
function useRecordedRun(scenario: Scenario, index: LabIndex): RunSummary | undefined {
  return useMemo(
    () =>
      index.runs.find((r) => r.task === scenario.liveTask && r.fault === scenario.faults.join("+") && r.agent === scenario.liveAgent) ??
      index.runs.find((r) => r.task === scenario.liveTask && r.fault === scenario.faults.join("+") && r.agent === scriptedStandIn(scenario)),
    [scenario, index],
  );
}