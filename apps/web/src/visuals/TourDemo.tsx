import { Bar, Check, Collapse, Field, Button, Row, Stage, Text, Window, type Act } from "../stageshow/kit";
import "./tour.css";

/**
 * Walkcast, acted out: a link is pasted, the browser walks three pages while the narration
 * writes itself, and the files the visit leaves behind arrive one by one.
 */

type Page = "home" | "pricing" | "dashboard";

type S = {
  url: string;
  focused: boolean;
  running: boolean;
  /** How many pages have been walked. */
  done: number;
  page: Page;
  caption: string;
  files: number;
  ready: boolean;
};

const initial: S = { url: "", focused: false, running: false, done: 0, page: "home", caption: "", files: 0, ready: false };

const URL_TEXT = "acme.app";

const PAGES: { id: Page; path: string; line: string }[] = [
  { id: "home", path: "/", line: "Opens the home page and reads the headline." },
  { id: "pricing", path: "/pricing", line: "Scrolls to the plans and compares the tiers." },
  { id: "dashboard", path: "/dashboard", line: "Signs in and opens the dashboard." },
];

const FILES = ["walkthrough.mp4", "captions.vtt", "transcript.txt"];

const POSTER: S = { url: URL_TEXT, focused: false, running: false, done: 3, page: "dashboard", caption: PAGES[2]!.line, files: 3, ready: true };

async function script(a: Act<S>) {
  await a.wait(700);
  await a.click("url");
  await a.set({ focused: true });
  await a.type("url", URL_TEXT);
  await a.wait(300);
  await a.move("rec");
  await a.click();
  await a.set({ focused: false, running: true });
  await a.wait(500);
  for (const [i, p] of PAGES.entries()) {
    await a.set({ page: p.id, caption: p.line });
    await a.wait(1100);
    await a.set({ done: i + 1 });
    await a.wait(250);
  }
  await a.set({ running: false });
  for (let i = 1; i <= FILES.length; i++) {
    await a.set({ files: i });
    await a.wait(260);
  }
  await a.set({ ready: true });
  await a.move({ x: 600, y: 340 });
  await a.wait(2400);
  await a.set({ ...initial });
  await a.wait(500);
}

/** A page of the recorded site, drawn the way a thumbnail is: a headline and a few blocks. */
function Mini({ page }: { page: Page }) {
  return (
    <div className="tr-mini" data-page={page}>
      <div className="tr-mini-nav">
        <Bar w={14} h={14} r={4} tone={4} />
        <Bar w={26} h={5} tone={2} />
        <Bar w={26} h={5} tone={2} />
        <Bar w={34} h={14} r={7} tone={5} />
      </div>
      {page === "home" && (
        <>
          <Text className="tr-mini-h">Ship faster with Acme</Text>
          <Bar w="70%" h={6} tone={2} />
          <div className="tr-mini-cta" />
        </>
      )}
      {page === "pricing" && (
        <>
          <Text className="tr-mini-h">Pricing</Text>
          <div className="tr-mini-plans">
            {["Free", "Team", "Scale"].map((n, i) => (
              <div key={n} className="tr-mini-plan" data-on={i === 1 || undefined}>
                <Text className="tr-mini-plan-n">{n}</Text>
                <Bar w="60%" h={6} tone={3} />
                <Bar w="80%" h={5} tone={2} />
              </div>
            ))}
          </div>
        </>
      )}
      {page === "dashboard" && (
        <>
          <Text className="tr-mini-h">Dashboard</Text>
          <div className="tr-mini-stats">
            {[0, 1, 2].map((i) => (
              <div key={i} className="tr-mini-stat">
                <Bar w="50%" h={5} tone={2} />
                <Bar w="70%" h={12} r={3} tone={4} />
              </div>
            ))}
          </div>
          <Bar w="100%" h={22} r={4} tone={2} />
        </>
      )}
    </div>
  );
}

export function TourDemo() {
  return (
    <Stage
      width={760}
      height={392}
      compact={{ below: 560, width: 358, height: 430 }}
      initial={initial}
      poster={POSTER}
      script={script}
      accent="#1d5e58"
      cursor={{ at: { wide: { x: 560, y: 330 }, compact: { x: 280, y: 380 } }, style: "arrow" }}
      className="tr"
    >
      {(s, _rect, layout) => (
        <>
          <Window title="Walkcast" className="tr-win">
            <div className="tr-body" data-layout={layout}>
              <section className="tr-left">
                <Field
                  value={s.url}
                  placeholder="Paste a link"
                  focused={s.focused}
                  box={{ "data-target": "url", "data-cursor": "ibeam" }}
                />
                <Button variant="primary" size="large" data-target="rec">
                  {s.running ? "Walking…" : s.ready ? "Record again" : "Record tour"}
                </Button>
                <div className="tr-rows">
                  {PAGES.map((p, i) => (
                    <Row
                      key={p.id}
                      pad={8}
                      selected={s.running && s.page === p.id}
                      lead={<Check on={s.done > i} pending={s.running && s.page === p.id && s.done <= i} />}
                      title={<Text>{p.path}</Text>}
                      meta={<span className="tr-status">{s.done > i ? "200" : ""}</span>}
                    />
                  ))}
                </div>
              </section>

              {layout === "wide" && (
                <section className="tr-right">
                  <div className="tr-pane">
                    <div className="tr-pane-bar">
                      <span className="tr-pane-url">{URL_TEXT + PAGES.find((p) => p.id === s.page)!.path}</span>
                      <span className="tr-rec" data-on={s.running || undefined}>
                        REC
                      </span>
                    </div>
                    <div className="tr-stack">
                      {PAGES.map((p) => (
                        <div key={p.id} className="tr-slide" data-on={s.page === p.id || undefined}>
                          <Mini page={p.id} />
                        </div>
                      ))}
                    </div>
                    <p className="tr-caption" data-on={!!s.caption || undefined}>
                      {s.caption || " "}
                    </p>
                  </div>
                </section>
              )}

              <section className="tr-files" data-layout={layout}>
                {FILES.map((f, i) => (
                  <Collapse key={f} open={s.files > i} reveal="drop" className="tr-file-wrap">
                    <div className="tr-file">
                      <Check on size={14} />
                      <Text>{f}</Text>
                    </div>
                  </Collapse>
                ))}
              </section>
            </div>
          </Window>

          <div className="tr-ready" data-show={s.ready || undefined}>
            <span className="tr-ready-dot" /> Tour ready · 0:42
          </div>
        </>
      )}
    </Stage>
  );
}
