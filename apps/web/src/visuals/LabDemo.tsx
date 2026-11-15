import { Badge, Bar, Button, Check, Collapse, Row, Stage, States, Text, Window, type Act } from "../stageshow/kit";
import "./lab.css";

/**
 * The Lab, acted out: a failed agent run, the step that broke it picked, its cause named, and the
 * run saved as a test that passes on replay.
 */

type S = {
  picked: boolean;
  cause: boolean;
  saved: boolean;
  replay: "idle" | "running" | "pass";
};

const initial: S = { picked: false, cause: false, saved: false, replay: "idle" };
const POSTER: S = { picked: true, cause: true, saved: true, replay: "pass" };

async function script(a: Act<S>) {
  await a.wait(800);
  await a.move("broken");
  await a.click();
  await a.set({ picked: true });
  await a.wait(500);
  await a.set({ cause: true });
  await a.wait(1500);
  await a.move("save");
  await a.wait(250);
  await a.click();
  await a.set({ saved: true });
  await a.wait(700);
  await a.move("replay");
  await a.click();
  await a.set({ replay: "running" });
  await a.wait(1100);
  await a.set({ replay: "pass" });
  await a.wait(2600);
  await a.set({ ...initial });
  await a.wait(500);
}

const STEPS: { cmd: string; note: string; ok: boolean }[] = [
  { cmd: "open /checkout", note: "200", ok: true },
  { cmd: 'click "Pay now"', note: "412ms", ok: true },
  { cmd: "wait .receipt", note: "timed out", ok: false },
];

export function LabDemo() {
  return (
    <Stage
      width={760}
      height={392}
      compact={{ below: 560, width: 358, height: 500 }}
      initial={initial}
      poster={POSTER}
      script={script}
      accent="#1d5e58"
      cursor={{ at: { wide: { x: 620, y: 340 }, compact: { x: 290, y: 400 } }, style: "arrow" }}
      className="lb"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Walkcast Lab · checkout-agent" className="lb-win">
            <div className="lb-body" data-layout={layout}>
              <section className="lb-trace">
                <header className="lb-head">
                  <span>Run 14</span>
                  <Badge tone="danger" dot>
                    Failed
                  </Badge>
                </header>
                {STEPS.map((st, i) => (
                  <Row
                    key={st.cmd}
                    pad={8}
                    selected={!st.ok && s.picked}
                    data-target={st.ok ? `ok-${i}` : "broken"}
                    data-cursor="pointer"
                    lead={st.ok ? <Check on size={15} /> : <span className="lb-x">×</span>}
                    title={<Text className="lb-cmd">{st.cmd}</Text>}
                    meta={<span className="lb-note" data-bad={!st.ok || undefined}>{st.note}</span>}
                  />
                ))}
                <div className="lb-filler">
                  <Bar w="70%" h={6} tone={2} />
                  <Bar w="50%" h={6} tone={2} />
                </div>
              </section>

              <section className="lb-side">
                <div className="lb-runs" aria-hidden="true">
                  <span className="lb-label">Last runs</span>
                  <span className="lb-dots">
                    {[true, true, true, true, false].map((ok, i) => (
                      <i key={i} data-ok={ok || (i === 4 && s.replay === "pass") || undefined} />
                    ))}
                  </span>
                </div>
                <Collapse open={s.cause} reveal="drop">
                  <div className="lb-cause">
                    <span className="lb-label">Cause</span>
                    <Badge tone="warning">Stale selector</Badge>
                    <p className="lb-evidence">
                      <code>button#pay</code> was replaced after step 2. The click landed on a detached node.
                    </p>
                  </div>
                </Collapse>

                <Collapse open={s.saved} reveal="drop">
                  <div className="lb-fixture">
                    <Check on={s.saved} size={14} />
                    <Text>checkout-stale.fixture.json</Text>
                  </div>
                </Collapse>

                <div className="lb-actions">
                  <Button variant="primary" data-target="save" size="large">
                    <States
                      value={s.saved ? "saved" : "save"}
                      states={{ save: "Save as test", saved: "Saved" }}
                    />
                  </Button>
                  <Button data-target="replay" size="large">
                    <States
                      value={s.replay}
                      states={{ idle: "Replay", running: "Replaying…", pass: "Passes" }}
                    />
                  </Button>
                </div>
              </section>
            </div>
          </Window>
        </>
      )}
    </Stage>
  );
}
