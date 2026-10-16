import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../App.tsx";
import { type NodeStatus, type Packet, Pipeline } from "../components/Pipeline.tsx";
import { CopyButton, Panel, PanelHeader, Verdict } from "../components/ui.tsx";
import { AGENT_INFO, FAULT_INFO, FAULT_NODE, TASKS } from "../lib/agents.ts";
import { type Capabilities, SignInRequired, loadCapabilities, loadRun, startRun } from "../lib/api.ts";
import { cn, faultLabel, ms } from "../lib/format.ts";
import { type Caption, narrate } from "../lib/narrate.ts";
import { type Scorecard, score } from "../lib/score.ts";
import type { LabIndex, RunDetail } from "../lib/types.ts";

const FAULT_ORDER = ["stale-owners", "ui-drift", "gateway-timeout", "session-expiry", "silent-owner-drop"];

function scenarioKey(faults: string[]): string {
  return faults.length ? [...faults].sort().join("+") : "none";
}

export function Simulator({ index, go, refresh }: { index: LabIndex; go: (r: Route) => void; refresh: () => Promise<LabIndex> }) {
  const agents = Object.keys(AGENT_INFO);
  const autoplay = useRef(false);
  const [agent, setAgent] = useState(() => (index.runs.some((r) => r.agent === "sh-p0") ? "sh-p0" : "v0"));
  const [faults, setFaults] = useState<string[]>(["gateway-timeout"]);
  const [task, setTask] = useState("create-lead");
  const taskInfo = TASKS.find((t) => t.id === task) ?? TASKS[0]!;
  const [hoverFault, setHoverFault] = useState<string | null>(null);
  const [caps, setCaps] = useState<Capabilities>({ live: false });
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "running" | "missing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [lab, setLab] = useState(index);

  useEffect(() => {
    loadCapabilities().then(setCaps);
  }, []);

  const key = scenarioKey(faults);
  const recorded = useMemo(() => lab.runs.find((r) => r.agent === agent && r.fault === key && r.task === task), [lab, agent, key, task]);
  const cleanBaseline = useMemo(() => lab.runs.find((r) => r.agent === agent && r.fault === "none" && r.task === task && r.verdict === "pass"), [lab, agent, task]);

  // Load the recorded run for the chosen scenario, if there is one.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!recorded) {
      setDetail(null);
      setState("missing");
      return;
    }
    setState("loading");
    loadRun(recorded.dir).then(
      (d) => {
        if (!cancelled) {
          setDetail(d);
          setState("idle");
        }
      },
      (e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setState("error");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [recorded]);

  const runLive = async () => {
    setState("running");
    setError(null);
    try {
      await startRun({ agent, fault: key, seed: 1, task, ...(AGENT_INFO[agent]?.kind === "stagehand" && !caps.providers?.length ? { modelMode: "scripted" } : {}) });
      autoplay.current = true;
      setLab(await refresh()); // the newest run for this scenario loads and plays
    } catch (e) {
      setNeedsSignIn(e instanceof SignInRequired);
      setError((e as Error).message);
      setState("error");
    }
  };
  // Which scenarios have a recording for this agent and task (for the markers and suggestions).
  const recordedKeys = useMemo(() => new Set(lab.runs.filter((r) => r.agent === agent && r.task === task).map((r) => r.fault)), [lab, agent, task]);
  const keyWith = (f: string) => scenarioKey(faults.includes(f) ? faults.filter((x) => x !== f) : [...faults, f]);
  const stagehandUnavailable = AGENT_INFO[agent]?.kind === "stagehand" && caps.live && caps.stagehand === false;

  const viaStagehand = AGENT_INFO[agent]?.kind === "stagehand";
  const captions = useMemo(() => (detail ? narrate(detail, viaStagehand) : []), [detail, viaStagehand]);
  const player = usePlayer(captions);
  const card = useMemo(() => (detail ? score(detail, cleanBaseline) : null), [detail, cleanBaseline]);
  useEffect(() => {
    if (autoplay.current && captions.length) {
      autoplay.current = false;
      player.restart(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captions]);
  const done = player.t >= player.duration;

  // At most two faults: a third can't be ticked until one is unticked (no silent swaps).
  const toggleFault = (f: string) => setFaults((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : cur.length >= 2 ? cur : [...cur, f]));

  return (
    <div className="grid gap-5">
      <div className="max-w-[72ch]">
        <div className="eyebrow">Fault replay</div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">See how a browser agent handles a broken app.</h1>
        <p className="mt-1 text-ink-2">
          Choose a task, an agent and up to two things that go wrong. We replay a <strong className="font-medium text-ink">real recorded run</strong> of exactly
          that setup on a diagram of the system, narrate what happened, and score it against the app's own records: did the job get done, and did the agent tell
          the truth about it?
        </p>
        <p className="mt-2 text-[13px] text-ink-3">
          Use it to explain a failure to your team, to compare agent versions on the same fault, or to see why a reliability fix matters before you ship it.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="grid gap-4">
          <Panel>
            <PanelHeader eyebrow="1 · what the agent is asked to do" title="Task" />
            <div className="grid gap-1.5 p-3" role="radiogroup" aria-label="Task">
              {TASKS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={task === t.id}
                  onClick={() => {
                    setTask(t.id);
                    setFaults((cur) => cur.filter((f) => t.faults.includes(f)));
                  }}
                  className={cn("rounded-lg border px-3 py-2 text-left transition-colors", task === t.id ? "border-signal bg-signal-soft" : "border-line hover:border-ink-3")}
                >
                  <div className="text-[13px] font-medium">{t.name}</div>
                  <div className="text-[12px] text-ink-2">{t.goal}</div>
                </button>
              ))}
            </div>
          </Panel>
          <Panel>
            <PanelHeader eyebrow="2 · who drives the browser" title="Agent" />
            <div className="grid gap-1.5 p-3" role="radiogroup" aria-label="Agent">
              {agents.map((a) => {
                const info = AGENT_INFO[a]!;
                return (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={agent === a}
                    onClick={() => setAgent(a)}
                    className={cn("rounded-lg border px-3 py-2 text-left transition-colors", agent === a ? "border-signal bg-signal-soft" : "border-line hover:border-ink-3")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12.5px] font-semibold">{info.name}</span>
                      <span className="font-mono text-[10px] uppercase text-ink-3">{info.kind}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] leading-snug text-ink-2">{info.note}</div>
                  </button>
                );
              })}
            </div>
          </Panel>
          <Panel>
            <PanelHeader eyebrow="3 · what goes wrong (max two)" title="Fault injectors" />
            <div className="grid gap-1.5 p-3">
              {FAULT_ORDER.filter((f) => taskInfo.faults.includes(f)).map((f) => {
                const on = faults.includes(f);
                const full = !on && faults.length >= 2;
                const hasRecording = recordedKeys.has(keyWith(f));
                return (
                  <label
                    key={f}
                    htmlFor={`fault-${f}`}
                    onMouseEnter={() => setHoverFault(f)}
                    onMouseLeave={() => setHoverFault(null)}
                    title={full ? "Two faults at most: untick one first." : undefined}
                    className={cn(
                      "flex gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                      full ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                      on ? "border-highlight-ink/30 bg-highlight/40" : "border-line hover:border-ink-3",
                    )}
                  >
                    <input
                      id={`fault-${f}`}
                      type="checkbox"
                      checked={on}
                      disabled={full}
                      onChange={() => toggleFault(f)}
                      onFocus={() => setHoverFault(f)}
                      onBlur={() => setHoverFault(null)}
                      className="mt-0.5 accent-[var(--signal)]"
                    />
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium">{FAULT_INFO[f]!.name}</span>
                        <span className="font-mono text-[10px] text-ink-3" title="Where in the system this fault happens">
                          at {FAULT_NODE[f]}
                        </span>
                      </span>
                      <span className="block text-[12px] leading-snug text-ink-2">{FAULT_INFO[f]!.what}</span>
                      <span className={cn("mt-1 flex items-center gap-1.5 text-[11px]", hasRecording ? "text-pass" : "text-ink-3")}>
                        <span className={cn("size-1.5 rounded-full", hasRecording ? "bg-pass" : "border border-ink-3")} aria-hidden />
                        {hasRecording ? `recorded ${on ? "without" : "with"} this` : `no recording ${on ? "without" : "with"} this yet`}
                      </span>
                    </span>
                  </label>
                );
              })}
              {faults.length === 0 && <p className="px-1 text-[12px] text-ink-3">No fault: the control run.</p>}
              {faults.length >= 2 && <p className="px-1 text-[12px] text-ink-3">Two faults at most. Untick one to choose another.</p>}
            </div>
          </Panel>
        </aside>

        <div className="grid min-w-0 gap-4">
          <Panel className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="eyebrow">Scenario</div>
                <div className="font-mono text-[13px]">
                  {task} · {agent} · {key}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {detail && <Verdict verdict={detail.summary.verdict} />}
                {caps.live && (
                  <button
                    type="button"
                    onClick={runLive}
                    disabled={state === "running" || stagehandUnavailable}
                    title={stagehandUnavailable ? "Stagehand agents need LAB_CHROME_PATH on the server (see README)." : "Starts a real browser against the test app; about 30 seconds."}
                    className="rounded-full bg-solid px-4 py-1.5 text-[13px] font-medium text-on-solid transition-colors hover:brightness-95 disabled:opacity-60"
                  >
                    {state === "running" ? "Running in a real browser…" : recorded ? "Re-run live (~30 s)" : "Run it live (~30 s)"}
                  </button>
                )}
                {detail && (
                  <button type="button" onClick={() => go({ view: "run", dir: detail.summary.dir })} className="rounded-full border border-line-strong px-4 py-1.5 text-[13px] text-ink-2 hover:border-signal hover:text-signal">
                    Open timeline
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto px-2 py-3">
              <Pipeline
                taskLabel={taskInfo.name.toLowerCase()}
                agentLabel={agent}
                modelLabel={detail?.result.model ? (detail.result.model.selection?.agent ?? detail.result.model.mode) : viaStagehand ? "model" : "none (scripted)"}
                stagehand={viaStagehand}
                faults={faults}
                status={player.status}
                packets={player.packets}
                highlight={hoverFault ? (FAULT_NODE[hoverFault] ?? null) : null}
                onToggleFault={toggleFault}
              />
            </div>
            <p className="border-t border-line px-4 py-2 text-[12px] leading-relaxed text-ink-3">
              <span className="font-medium text-ink-2">How to read it:</span> left is the agent and the model making its decisions; right is the app under test.
              Dots are requests travelling between them; a box turns amber or red when something goes wrong there. The <em>oracle</em> is the app's own
              database, used to check what the agent claimed.
            </p>
            <PlayerBar player={player} disabled={!detail} />
            {state === "missing" && (
              <div className="grid gap-2 border-t border-line px-4 py-3 text-[13px]">
                <span className="text-ink-2">
                  {caps.live ? "No recording of this exact setup yet. Run it live above, or pick one that has a recording:" : "This setup isn't in the snapshot. Pick one that is, or run it locally:"}
                </span>
                {recordedKeys.size > 0 && (
                  <span className="flex flex-wrap gap-1.5">
                    {[...recordedKeys].slice(0, 8).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setFaults(k === "none" ? [] : k.split("+"))}
                        className="rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-2 hover:border-signal hover:text-signal"
                      >
                        {faultLabel(k)}
                      </button>
                    ))}
                  </span>
                )}
                {!caps.live && <CopyButton text={`npm run lab -- run --task ${task} --agent ${agent} --fault ${key}${viaStagehand ? " --model-mode scripted" : ""}`} />}
              </div>
            )}
            {error && (
              <p className="border-t border-line px-4 py-3 text-[13px] text-fail">
                {error}{" "}
                {needsSignIn && (
                  <a className="font-medium underline" href={`/login?next=${encodeURIComponent("/app#simulator")}`}>
                    Sign in
                  </a>
                )}
              </p>
            )}
          </Panel>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Narration captions={captions} t={player.t} playing={player.playing} />
            <ScorePanel card={card} revealed={done || !detail} onReveal={() => player.seek(player.duration)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ playback

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

function usePlayer(captions: Caption[]): Player {
  const duration = captions.length ? captions[captions.length - 1]!.at + 400 : 0;
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
  }, [captions]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const prev = tRef.current;
      const next = Math.min(duration, prev + (now - last) * speed);
      last = now;
      const fired = captions.filter((c) => c.at > prev && c.at <= next);
      if (fired.length) {
        const fresh = fired.flatMap((c) => c.edges.map((edge) => ({ id: nextId.current++, edge, tone: c.tone })));
        setPackets((cur) => [...cur.slice(-24), ...fresh]);
      }
      tRef.current = next;
      setT(next);
      if (next >= duration) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, captions, duration]);

  const status = useMemo(() => {
    const s: Record<string, NodeStatus> = {};
    for (const c of captions) {
      if (c.at > t) break;
      for (const n of c.nodes) {
        if (c.tone === "fail") s[n] = "fail";
        else if (c.tone === "warn" && s[n] !== "fail") s[n] = "warn";
        else if (c.tone === "pass") s[n] = "pass";
        else if (!s[n] || s[n] === "active") s[n] = t - c.at < 500 ? "active" : (s[n] ?? "idle");
      }
    }
    return s;
  }, [captions, t]);

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

function PlayerBar({ player, disabled }: { player: Player; disabled: boolean }) {
  const pct = player.duration ? (player.t / player.duration) * 100 : 0;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (player.playing ? player.pause() : player.play())}
        aria-label={player.playing ? "Pause" : "Play"}
        className="rounded-full bg-solid px-4 py-1.5 font-mono text-[12px] text-on-solid transition-colors hover:brightness-95 disabled:opacity-40"
      >
        {player.playing ? "Pause" : "Play"}
      </button>
      <button type="button" disabled={disabled} onClick={() => player.restart(true)} aria-label="Restart" className="rounded-full border border-line-strong px-3 py-1 font-mono text-[12px] text-ink-2 hover:text-signal disabled:opacity-40">
        Restart
      </button>
      <button type="button" disabled={disabled} onClick={() => player.seek(player.duration)} aria-label="Skip to the result" className="rounded-full border border-line-strong px-3 py-1 font-mono text-[12px] text-ink-2 hover:text-signal disabled:opacity-40">
        End
      </button>
      <label htmlFor="sim-scrub" className="sr-only">
        Position
      </label>
      <input
        id="sim-scrub"
        type="range"
        min={0}
        max={Math.max(1, player.duration)}
        value={player.t}
        disabled={disabled}
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
            className={cn("inline-flex items-center gap-0.5 rounded-full px-2.5 py-0.5 font-mono text-[11.5px] transition-colors", player.speed === s ? "bg-solid text-on-solid" : "text-ink-2 hover:text-ink")}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function Narration({ captions, t, playing }: { captions: Caption[]; t: number; playing: boolean }) {
  const current = captions.reduce((idx, c, i) => (c.at <= t ? i : idx), -1);
  const [speak, setSpeak] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[current] as HTMLElement | undefined;
    if (list && item) list.scrollTop = Math.max(0, item.offsetTop - list.clientHeight / 2);
  }, [current]);

  useEffect(() => {
    if (canSpeak && (!playing || !speak)) window.speechSynthesis.cancel();
  }, [playing, speak, canSpeak]);

  useEffect(() => {
    if (!speak || !playing || current < 0 || !canSpeak) return;
    const text = captions[current]?.text;
    if (!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.08;
    window.speechSynthesis.speak(u);
  }, [current, speak, playing, captions, canSpeak]);

  useEffect(() => () => (canSpeak ? window.speechSynthesis.cancel() : undefined), [canSpeak]);

  return (
    <Panel className="min-w-0">
      <PanelHeader
        eyebrow="Generated from recorded events only"
        title="Narration"
        aside={
          canSpeak ? (
            <button
              type="button"
              onClick={() => setSpeak((s) => !s)}
              aria-pressed={speak}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors", speak ? "border-signal text-signal" : "border-line-strong text-ink-2 hover:text-ink")}
            >
              {speak ? "Speaking" : "Speak"}
            </button>
          ) : null
        }
      />
      {captions.length === 0 ? (
        <p className="px-4 py-6 text-ink-3">Pick a recorded scenario and press play.</p>
      ) : (
        <ol ref={listRef} className="relative max-h-[340px] overflow-y-auto px-2 py-2">
          {captions.map((c, i) => (
            <li
              key={i}
              className={cn(
                "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                i === current ? "bg-panel-2" : i > current ? "opacity-45" : "",
                c.tone === "fail" && i <= current && "text-fail",
                c.tone === "pass" && i <= current && "text-pass",
                c.tone === "warn" && i <= current && "text-warn",
              )}
            >
              <span className="tabular pt-px font-mono text-[11px] text-ink-3">{ms(c.at)}</span>
              <span className="[overflow-wrap:anywhere]">{c.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function ScorePanel({ card, revealed, onReveal }: { card: Scorecard | null; revealed: boolean; onReveal: () => void }) {
  if (!card) return null;
  const tone = card.total >= 71 ? "text-pass" : card.total >= 51 ? "text-warn" : "text-fail";
  return (
    <Panel className="min-w-0">
      <PanelHeader eyebrow="5 categories × 20 points" title="Reliability scorecard" />
      {!revealed ? (
        <div className="grid gap-2 px-4 py-6 text-center">
          <p className="text-ink-2">Play the run to the end to see how it scored.</p>
          <button type="button" onClick={onReveal} className="mx-auto rounded-full border border-line-strong px-4 py-1.5 text-[13px] text-ink-2 hover:border-signal hover:text-signal">
            Skip to the score
          </button>
        </div>
      ) : (
        <div className="grid gap-3 p-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className={cn("tabular font-display text-[44px] font-semibold leading-none", tone)}>{card.total}</div>
              <div className="font-mono text-[11px] text-ink-3">of 100</div>
            </div>
            <div className={cn("font-display text-xl font-semibold", tone)}>{card.grade}</div>
          </div>
          <ul className="grid gap-2.5">
            {card.lines.map((l) => (
              <li key={l.key} className="grid gap-1">
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
          <p className="border-t border-line pt-2 font-mono text-[10.5px] text-ink-3">Brittle &lt;31 · Fragile &lt;51 · Dependable &lt;71 · Robust &lt;86 · Production-ready 86+</p>
        </div>
      )}
    </Panel>
  );
}
