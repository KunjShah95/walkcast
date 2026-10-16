"""
Generates the Walkcast architecture diagrams as Excalidraw files (and SVG previews).

    python docs/architecture/build.py

Each diagram is laid out by hand below; every label names real modules, routes and tables
from src/ and supabase/migrations/. Edit the layout here and re-run rather than hand-editing
the .excalidraw JSON, so the four files stay consistent.
"""
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent
random.seed(7)

INK = "#1e1e1e"
MUTED = "#495057"
FILL = {
    "blue": "#a5d8ff", "green": "#b2f2bb", "yellow": "#ffec99", "red": "#ffc9c9",
    "violet": "#d0bfff", "grey": "#e9ecef", "orange": "#ffd8a8", "teal": "#96f2d7",
    "white": "#ffffff", "pink": "#fcc2d7",
}
ZONE = {
    "blue": "#e7f5ff", "green": "#ebfbee", "yellow": "#fff9db", "red": "#fff5f5",
    "violet": "#f3f0ff", "grey": "#f8f9fa", "orange": "#fff4e6", "teal": "#e6fcf5",
}
FONT = 5  # Excalifont
CHAR_W = 0.55  # average glyph width as a fraction of font size (Excalifont)
LINE_H = 1.25


def measure(text, fs):
    lines = text.split("\n")
    w = max(len(l) for l in lines) * fs * CHAR_W
    h = len(lines) * fs * LINE_H
    return w, h


def base(id, type, x, y, w, h, **kw):
    e = {
        "id": id, "type": type, "x": x, "y": y, "width": w, "height": h, "angle": 0,
        "strokeColor": INK, "backgroundColor": "transparent", "fillStyle": "solid",
        "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
        "groupIds": [], "frameId": None, "roundness": None, "seed": random.randint(1, 2**31),
        "version": 1, "versionNonce": random.randint(1, 2**31), "isDeleted": False,
        "boundElements": [], "updated": 1760600000000, "link": None, "locked": False,
    }
    e.update(kw)
    return e


class Diagram:
    def __init__(self, name):
        self.name = name
        self.els = []
        self.boxes = {}
        self.n = 0
        self.warnings = []

    def _id(self, p):
        self.n += 1
        return f"{p}-{self.n}"

    def _text(self, s, x, y, fs, color=INK, align="left", valign="top", container=None, w=None, h=None):
        tw, th = measure(s, fs)
        return base(self._id("t"), "text", x, y, w or tw, h or th, strokeColor=color, text=s, originalText=s,
                    fontSize=fs, fontFamily=FONT, textAlign=align, verticalAlign=valign,
                    containerId=container, lineHeight=LINE_H, autoResize=True, baseline=round(fs * 0.9))

    def text(self, s, x, y, fs=16, color=INK, align="left"):
        t = self._text(s, x, y, fs, color, align)
        if align == "center":
            t["x"] = x - t["width"] / 2
        self.els.append(t)
        return t

    def box(self, key, x, y, w, h, label, fill="white", fs=16, dashed=False, stroke=INK, shape="rectangle", rough=1):
        rid = self._id("r")
        r = base(rid, shape, x, y, w, h, backgroundColor=FILL.get(fill, fill), strokeColor=stroke,
                 strokeStyle="dashed" if dashed else "solid", roughness=rough,
                 roundness={"type": 3} if shape == "rectangle" else {"type": 2})
        tw, th = measure(label, fs)
        if tw > w - 16 or th > h - 10:
            self.warnings.append(f"{self.name}: '{label.splitlines()[0]}' needs {tw:.0f}x{th:.0f}, box {w}x{h}")
        t = self._text(label, x + (w - tw) / 2, y + (h - th) / 2, fs, align="center", valign="middle", container=rid)
        r["boundElements"].append({"id": t["id"], "type": "text"})
        self.els += [r, t]
        self.boxes[key] = r
        return r

    def zone(self, x, y, w, h, title, tone="grey", fs=20, sub=None, key=None, right=False):
        r = base(self._id("z"), "rectangle", x, y, w, h, backgroundColor=ZONE[tone], strokeColor=MUTED,
                 strokeStyle="dashed", strokeWidth=1, roughness=0, roundness={"type": 3})
        self.els.append(r)
        if key:
            self.boxes[key] = r
        tw, _ = measure(title, fs)
        self.text(title, x + w - tw - 16 if right else x + 16, y + 12, fs, INK)
        if sub:
            self.text(sub, x + 16, y + 14 + fs * LINE_H, 14, MUTED)
        return r

    def line(self, x1, y1, x2, y2, dashed=True, color=MUTED, width=1):
        self.els.append(base(self._id("l"), "line", x1, y1, x2 - x1, y2 - y1, strokeColor=color, strokeWidth=width,
                             strokeStyle="dashed" if dashed else "solid", roughness=0,
                             points=[[0, 0], [x2 - x1, y2 - y1]], lastCommittedPoint=None,
                             startBinding=None, endBinding=None, startArrowhead=None, endArrowhead=None))

    @staticmethod
    def _side(r, side, f=0.5):
        x, y, w, h = r["x"], r["y"], r["width"], r["height"]
        return {"l": (x, y + h * f), "r": (x + w, y + h * f), "t": (x + w * f, y), "b": (x + w * f, y + h)}[side]

    def arrow(self, a, b, label=None, sides=None, fa=0.5, fb=0.5, dashed=False, fs=14, color=INK, both=False, via=None, lpos=0.5):
        ra, rb = self.boxes[a], self.boxes[b]
        if sides is None:
            ax, ay = ra["x"] + ra["width"] / 2, ra["y"] + ra["height"] / 2
            bx, by = rb["x"] + rb["width"] / 2, rb["y"] + rb["height"] / 2
            dx, dy = bx - ax, by - ay
            gap_x = abs(dx) - (ra["width"] + rb["width"]) / 2
            gap_y = abs(dy) - (ra["height"] + rb["height"]) / 2
            if gap_x > gap_y:
                sides = ("r", "l") if dx > 0 else ("l", "r")
            else:
                sides = ("b", "t") if dy > 0 else ("t", "b")
        p1 = self._side(ra, sides[0], fa)
        p2 = self._side(rb, sides[1], fb)
        pts = [p1] + (via or []) + [p2]
        x0, y0 = p1
        rel = [[px - x0, py - y0] for px, py in pts]
        xs = [p[0] for p in rel]
        ys = [p[1] for p in rel]
        aid = self._id("a")
        bent = len(pts) > 2
        arr = base(aid, "arrow", x0, y0, max(xs) - min(xs), max(ys) - min(ys), strokeColor=color,
                   strokeStyle="dashed" if dashed else "solid", roughness=1,
                   # Bent arrows keep sharp corners so they follow the routing channels exactly.
                   roundness=None if bent else {"type": 2},
                   points=rel, lastCommittedPoint=None,
                   startBinding={"elementId": ra["id"], "focus": 0, "gap": 4},
                   endBinding={"elementId": rb["id"], "focus": 0, "gap": 4},
                   startArrowhead="arrow" if both else None, endArrowhead="arrow", elbowed=False)
        ra["boundElements"].append({"id": aid, "type": "arrow"})
        rb["boundElements"].append({"id": aid, "type": "arrow"})
        self.els.append(arr)
        if label:
            seg = min(int(lpos * (len(pts) - 1)), len(pts) - 2)
            (sx, sy), (ex, ey) = pts[seg], pts[seg + 1]
            f = (lpos * (len(pts) - 1)) - seg
            mx, my = sx + (ex - sx) * f, sy + (ey - sy) * f
            tw, th = measure(label, fs)
            if not bent:
                # Excalidraw centres a bound label on a straight arrow itself.
                lt = self._text(label, mx - tw / 2, my - th / 2, fs, MUTED, align="center", valign="middle", container=aid)
                arr["boundElements"].append({"id": lt["id"], "type": "text"})
            else:
                # On a routed arrow Excalidraw would put a bound label at its own midpoint, so the
                # label is free text placed beside the chosen segment instead.
                horizontal = abs(ey - sy) < abs(ex - sx)
                lx, ly = (mx - tw / 2, my - th - 4) if horizontal else (mx + 8, my - th / 2)
                lt = self._text(label, lx, ly, fs, MUTED, align="left")
            self.els.append(lt)
        return arr

    def save(self):
        doc = {"type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
               "elements": self.els, "appState": {"viewBackgroundColor": "#ffffff", "gridSize": 20}, "files": {}}
        (OUT / f"{self.name}.excalidraw").write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf8")
        (OUT / "preview").mkdir(exist_ok=True)
        (OUT / "preview" / f"{self.name}.svg").write_text(svg(self.els), encoding="utf8")
        for w in self.warnings:
            print("WARN", w)


def svg(els):
    xs = [e["x"] for e in els] + [e["x"] + e["width"] for e in els]
    ys = [e["y"] for e in els] + [e["y"] + e["height"] for e in els]
    x0, y0, x1, y1 = min(xs) - 40, min(ys) - 40, max(xs) + 40, max(ys) + 40
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {x1 - x0} {y1 - y0}" width="{x1 - x0}" height="{y1 - y0}" font-family="Segoe Print, Comic Sans MS, sans-serif">',
           f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="#fff"/>',
           '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1e1e1e"/></marker></defs>']
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    for e in els:
        dash = ' stroke-dasharray="8 6"' if e["strokeStyle"] == "dashed" else ""
        if e["type"] in ("rectangle", "ellipse"):
            fill = e["backgroundColor"] if e["backgroundColor"] != "transparent" else "none"
            if e["type"] == "rectangle":
                out.append(f'<rect x="{e["x"]}" y="{e["y"]}" width="{e["width"]}" height="{e["height"]}" rx="10" fill="{fill}" stroke="{e["strokeColor"]}" stroke-width="{e["strokeWidth"]}"{dash}/>')
            else:
                out.append(f'<ellipse cx="{e["x"] + e["width"] / 2}" cy="{e["y"] + e["height"] / 2}" rx="{e["width"] / 2}" ry="{e["height"] / 2}" fill="{fill}" stroke="{e["strokeColor"]}" stroke-width="{e["strokeWidth"]}"{dash}/>')
        elif e["type"] in ("arrow", "line"):
            pts = " ".join(f'{e["x"] + px},{e["y"] + py}' for px, py in e["points"])
            mk = ' marker-end="url(#ah)"' if e.get("endArrowhead") else ""
            mk += ' marker-start="url(#ah)"' if e.get("startArrowhead") else ""
            out.append(f'<polyline points="{pts}" fill="none" stroke="{e["strokeColor"]}" stroke-width="{e["strokeWidth"]}"{dash}{mk}/>')
    for e in els:
        if e["type"] == "text":
            lines = e["text"].split("\n")
            fs = e["fontSize"]
            anchor = {"left": "start", "center": "middle", "right": "end"}[e["textAlign"]]
            tx = e["x"] + (e["width"] / 2 if anchor == "middle" else 0)
            bg = ""
            if e.get("containerId", "") and e["containerId"].startswith("a-"):
                bg = f'<rect x="{e["x"] - 3}" y="{e["y"] - 1}" width="{e["width"] + 6}" height="{e["height"] + 2}" fill="#fff"/>'
            out.append(bg + "".join(
                f'<text x="{tx}" y="{e["y"] + fs * (i + 0.9) * LINE_H - fs * 0.2}" font-size="{fs}" fill="{e["strokeColor"]}" text-anchor="{anchor}">{esc(l)}</text>'
                for i, l in enumerate(lines)))
    out.append("</svg>")
    return "\n".join(out)


# ============================================================================ 1. Architecture overview
def overview():
    d = Diagram("01-architecture-overview")
    d.text("Walkcast — Architecture overview", 40, 20, 36)
    d.text("Actors, containers and external systems. One codebase runs three ways: local (one process), Vercel (CDN + one function), AWS (ECS web + worker fleet).", 40, 72, 16, MUTED)

    # Columns: A people 20-320 | B edge 380-680 | C web 740-1500 | D state 1580-1960 | E identity 2040-2400
    # Routing channels: x=350 (A|B), x=1540 (C|D), y=680 (top zones | worker zone), y=130 (above zones)
    d.zone(20, 160, 300, 900, "People & clients", "grey")
    d.box("maker", 45, 220, 250, 110, "Walkthrough maker\n(founder / PM / marketer)\npastes a URL, gets a video", "yellow", fs=15)
    d.box("eng", 45, 430, 250, 110, "Agent engineer\nturns a failed agent run\ninto a regression fixture", "yellow", fs=15)
    d.box("crawler", 45, 600, 250, 100, "Search & AI crawlers\nrobots.txt · sitemap.xml\nllms.txt", "grey", fs=15)
    d.box("ci", 45, 830, 250, 180, "Operator / CI\nnpm run lab -- record | run\n| check | experiment\n(runs the worker code\nin-process, no web tier)", "yellow", fs=15)

    d.zone(380, 160, 300, 480, "Edge", "blue")
    d.box("cdn", 405, 220, 250, 180, "CDN (static files)\nprerendered public site\n19 pages · fonts\ndemo media\nsite/prerender.ts\ndeploy/vercel-build.ts", "blue", fs=15)
    d.box("lb", 405, 440, 250, 170, "Router / load balancer\nVercel routes or AWS ALB\nhealth check /readyz\n(fails while draining\nso no new requests land)", "blue", fs=15)

    d.zone(740, 160, 760, 480, "Web tier — ui/server.ts · stateless, N instances", "green", key="web")
    d.box("pages", 770, 220, 330, 120, "Public site SSR\nsite/pages.ts · guides.ts\nlanding · lab · pricing · compare", "green", fs=15)
    d.box("auth", 1140, 220, 330, 120, "Accounts & sign-in\nscrypt + Google OAuth (site/auth.ts)\nor Supabase Auth; OpenRouter and\nChatGPT connect via PKCE", "green", fs=14)
    d.box("spa", 770, 390, 330, 110, "Dashboard SPA  /app\nVite + React (dashboard/)\nRecord · Library · Runs · Lab", "green", fs=15)
    d.box("data", 770, 530, 330, 80, "Read index (ui/data.ts)\nruns/ · fixtures/ · results/", "green", fs=14)
    d.box("api", 1140, 390, 330, 220, "JSON API\nPOST /api/record · /api/run\nGET /api/jobs/:id  (ETag → 304)\n/api/index · /api/metrics\n/files/recordings/:id/*\ndaily quota · 1 active job\npassword sealed AES-256-GCM\nreturns 202, browser polls", "green", fs=14)

    d.zone(1580, 160, 380, 480, "Shared state", "violet")
    d.box("pg", 1610, 220, 320, 220, "Postgres (Supabase)\nstore/pg-store.ts\nusers · sessions · rate_limits\njobs = the queue\nFOR UPDATE SKIP LOCKED\nleases · fenced finish\nrecordings index", "violet", fs=15)
    d.box("s3", 1610, 480, 320, 130, "Object storage\nS3 / Supabase Storage (S3Media)\nMP4 · WebM · VTT · WAV · JSON", "violet", fs=14)

    d.zone(2040, 160, 360, 480, "Identity & ops", "red")
    d.box("idp", 2065, 220, 310, 150, "Identity providers\nGoogle OAuth\nSupabase Auth\nOpenRouter · ChatGPT OAuth", "red", fs=15)
    d.box("logs", 2065, 430, 310, 120, "Log pipeline (CloudWatch …)\nJSON lines, ops/log.ts\n/api/metrics: queue depth,\noldest wait, p50 / p95", "grey", fs=14)

    d.zone(380, 720, 2020, 340, "Worker fleet — `lab worker` (jobs/worker.ts)", "orange", key="wz", right=True)
    d.box("loop", 420, 790, 320, 180, "Job loop\nclaim → heartbeat (lease/3)\n→ execute → publish → finish\nlease margin 80% · deadline 6 min\nidle backoff 2 → 10 s + jitter\nretry once unless RecordError", "orange", fs=14)
    d.box("rec", 780, 790, 320, 180, "Site recorder  src/record/\nSSRF guard · robots.txt\nsign-in autodetect\nBFS same-origin, ≤ 50 pages\nnarration written from the trace", "orange", fs=14)
    d.box("lab", 1140, 790, 330, 180, "Walkcast Lab  src/lab/\nMiniCRM app + injected faults\nscripted or Stagehand agent\noracle reads the app's state\ndeterministic diagnosis\nfixture + model cassette", "orange", fs=14)
    d.box("ffmpeg", 420, 990, 320, 56, "ffmpeg + flite voices\nslt · awb · kal · rms", "grey", fs=14)
    d.box("chrome", 840, 990, 630, 56, "Chromium (Playwright) — one warm instance shared per worker", "grey", fs=14)
    d.box("llm", 1610, 790, 320, 150, "LLM providers  (external)\nAnthropic · OpenAI-compatible\nOpenRouter · ChatGPT plan\nvia llm/gateway.ts", "red", fs=14)
    d.box("site", 1610, 960, 320, 86, "Target website  (external)\nthe owner-authorized site", "red", fs=14)
    d.box("oob", 2065, 790, 310, 180, "Secrets never leave the job\nsite password sealed in the\nqueue, opened in the worker,\nscrubbed from traces as\n{{secret:site_password}};\nmodel keys scoped per job\n(llm/credentials.ts)", "white", fs=14)

    # people → edge
    d.arrow("maker", "cdn", "HTTPS", sides=("r", "l"), fa=0.5, fb=(275 - 220) / 180)
    d.arrow("eng", "lb", "HTTPS", sides=("r", "l"), fa=0.5, fb=(485 - 440) / 170)
    d.arrow("crawler", "cdn", "crawl", sides=("r", "l"), fa=0.5, fb=0.85, via=[(350, 650), (350, 373)], lpos=0.5)
    d.arrow("ci", "wz", None, sides=("r", "l"), fa=0.5, fb=(920 - 720) / 340, dashed=True)
    # edge → web
    d.arrow("cdn", "lb", "other routes", sides=("b", "t"))
    d.arrow("lb", "web", "/app · /api\n/auth · /files", sides=("r", "l"), fa=0.5, fb=(525 - 160) / 480, fs=12)
    d.arrow("spa", "api", None, sides=("r", "l"), fa=0.45, fb=(440 - 390) / 220)
    # web → state / identity
    d.arrow("api", "pg", "sessions · quota\nenqueue · status", sides=("r", "l"), fa=(415 - 390) / 220, fb=(415 - 220) / 220, fs=13)
    d.arrow("api", "s3", "presign GET\n(15 min)", sides=("r", "l"), fa=(560 - 390) / 220, fb=(560 - 480) / 130, fs=13)
    d.arrow("auth", "idp", "OAuth 2.0 / PKCE", sides=("t", "t"), fa=0.85, fb=0.75, via=[(1420.5, 130), (2297.5, 130)], lpos=0.5)
    # worker
    d.arrow("loop", "pg", "claim SKIP LOCKED · heartbeat · setProgress · saveRecording · finish (fenced)", sides=("t", "l"), fa=0.3, fb=0.5,
            via=[(516, 668), (1555, 668), (1555, 330)], lpos=0.5)
    d.arrow("loop", "s3", "media.publish (PUT)", sides=("t", "b"), fa=0.6, fb=0.3, via=[(612, 706), (1706, 706)], lpos=0.55)
    d.arrow("loop", "rec", None, sides=("r", "l"), fa=0.4, fb=0.4)
    d.arrow("loop", "lab", "run job", sides=("t", "t"), fa=0.92, fb=0.5, via=[(714, 765), (1305, 765)], lpos=0.62)
    d.arrow("rec", "ffmpeg", None, sides=("b", "r"), fa=0.06, fb=0.5, via=[(799.2, 1018)])
    d.arrow("rec", "chrome", None, sides=("b", "t"), fa=0.6, fb=(972 - 840) / 630)
    d.arrow("lab", "chrome", None, sides=("b", "t"), fa=0.5, fb=(1305 - 840) / 630)
    d.arrow("lab", "llm", "live · replay\n· scripted", sides=("r", "l"), fa=0.4, fb=(862 - 790) / 150, fs=13)
    d.arrow("chrome", "site", "HTTPS walk", sides=("r", "l"), fa=0.5, fb=(1018 - 960) / 86)

    d.zone(20, 1110, 2380, 230, "Deployment modes (same code, different adapters)", "teal")
    d.box("m1", 50, 1175, 720, 135, "Local · npm run ui\none process: web + in-process Worker (poked on enqueue)\nFileStore (.lab/store.json) · LocalMedia (recordings/)\nLAB_AUTH=off skips accounts", "teal", fs=15)
    d.box("m2", 820, 1175, 760, 135, "Vercel · one deployment\nCDN serves the prerendered pages; one Function runs the server\nno browser → jobs refused unless LAB_EXTERNAL_WORKER=1\nand a `lab worker` elsewhere shares the database", "teal", fs=15)
    d.box("m3", 1630, 1175, 740, 135, "AWS · docs/DEPLOY-AWS.md\nRoute 53 → ALB → ECS web (≥ 2) + ECS workers (1..N, Fargate)\nSupabase Postgres for state + queue · S3 for media\nscale workers on the oldest queued job's age (docs/SCALING.md)", "teal", fs=15)
    d.save()

# ============================================================================ 2. System design
def system_design():
    d = Diagram("02-system-design")
    d.text("Walkcast — System design: one recording, end to end", 40, 20, 36)
    d.text("A record job from submit to playback, then the job state machine and failure handling. Lab runs (/api/run) take the same queue path; only execute() differs.", 40, 72, 16, MUTED)

    lanes = [("spa", "Dashboard SPA\n(browser)", "green"), ("web", "Web server\nui/server.ts", "green"), ("pg", "Postgres\njobs · rate_limits\nrecordings", "violet"),
             ("wk", "Worker\njobs/worker.ts", "orange"), ("site", "Chromium →\ntarget site", "red"), ("ff", "ffmpeg + flite", "grey"), ("s3", "Object storage", "violet")]
    lx = {}
    for i, (k, label, tone) in enumerate(lanes):
        x = 60 + i * 250
        d.box(k, x, 130, 200, 90, label, tone, fs=15)
        lx[k] = x + 100
    top, bottom = 220, 1310
    for k in lx:
        d.line(lx[k], top, lx[k], bottom)

    msgs = [
        ("spa", "web", "1  POST /api/record {url, username, password, authorized}\nIdempotency-Key header · validateRecord (SSRF on exposed host)"),
        ("web", "pg", "2  hit('quota:record:<user>', 24 h) → ≤ 20 per day"),
        ("web", "pg", "3  enqueueLimited(job, maxActive = 1) — check + insert in ONE statement\njob.secret = seal(password) · AES-256-GCM"),
        ("web", "spa", "4  202 {job, queue: {ahead, oldestQueuedMs}} · worker.poke() if in-process"),
        ("spa", "web", "5  GET /api/jobs/:id every 1–4 s · ETag → 304 · 1.5 s status cache"),
        ("wk", "pg", "6  claim(workerId, lease 60 s) · FOR UPDATE SKIP LOCKED · attempts++"),
        ("wk", "pg", "7  heartbeat every lease/3 · setProgress (throttled 1 s) · abort if unconfirmed > 80% lease"),
        ("wk", "site", "8  recordSite: robots.txt · sign in · BFS same-origin links · scroll each page\nNarratedTools holds each step as long as its line takes to speak"),
        ("wk", "ff", "9  captionsFor(trace) → flite per line → mux MP4 (H.264 + AAC + captions) + WebM"),
        ("wk", "s3", "10  media.publish(id, files) — PUT, idempotent"),
        ("wk", "pg", "11  saveRecording(row) — upsert by id = the commit point users see"),
        ("wk", "pg", "12  finish(succeeded) WHERE locked_by = workerId (fence) · secret := null"),
        ("spa", "web", "13  GET /files/recordings/:id/recording.mp4 (owner check)"),
        ("web", "spa", "14  302 → presigned S3 URL (15 min)  ·  LocalMedia: stream with Range"),
    ]
    y = 260
    for a, b, label in msgs:
        h = 34 if "\n" not in label else 50
        ax, bx = lx[a], lx[b]
        aid = d._id("a")
        pts = [[0, 0], [bx - ax, 0]]
        arr = base(aid, "arrow", ax, y + h, abs(bx - ax), 0, points=pts, lastCommittedPoint=None, startBinding=None, endBinding=None,
                   startArrowhead=None, endArrowhead="arrow", roughness=1, roundness={"type": 2}, elbowed=False,
                   strokeStyle="dashed" if b == "spa" else "solid")
        d.els.append(arr)
        left = min(ax, bx)
        d.text(label, left + 10 if b != "spa" and a != "spa" or True else left, y, 14, INK)
        y += h + 40

    # notes on the right
    d.zone(1830, 130, 560, 1180, "Why it is shaped like this", "grey")
    notes = [
        ("No request outlives the load balancer", "Submit returns 202 at once; the browser polls.\nNothing depends on a 60 s ALB idle timeout."),
        ("Limits hold across instances", "Daily quota is an upsert counter; the active-job\nceiling and the insert are one SQL statement."),
        ("Passwords never sit in the queue in clear", "Sealed with LAB_SECRET_KEY (AES-256-GCM); only\nworkers open it; cleared when the job ends. Traces\nand captions show {{secret:site_password}}."),
        ("Exactly one owner writes a result", "Every terminal write is fenced by locked_by =\nworkerId, so a worker whose lease lapsed (zombie)\nwrites nothing."),
        ("Storage before index", "Publish media, then index. A crash in between leaves\nan orphan blob, never a row pointing at nothing."),
        ("Users see movement", "Progress is written at stage cadence, throttled to\n1/s, separate from the 20 s ownership heartbeat."),
    ]
    ny = 200
    for title, body in notes:
        d.box(d._id("note"), 1860, ny, 500, 160, f"{title}\n\n{body}", "white", fs=15)
        ny += 180

    # state machine
    d.zone(40, 1360, 1150, 520, "Job state machine (jobs.status)", "orange")
    d.box("q", 90, 1500, 200, 90, "queued", "yellow", fs=20)
    d.box("r", 480, 1500, 200, 90, "running\nattempts++ · lease", "blue", fs=16)
    d.box("ok", 900, 1420, 220, 90, "succeeded\nresult · secret = null", "green", fs=15)
    d.box("ko", 900, 1620, 220, 90, "failed\nerror · secret = null", "red", fs=15)
    d.box("cx", 90, 1720, 200, 80, "cancelled", "grey", fs=18)
    d.arrow("q", "r", "claim (FIFO,\nSKIP LOCKED)", sides=("r", "l"), fa=0.35, fb=0.35)
    d.arrow("r", "ok", "finish(succeeded)\nfenced", sides=("r", "l"), fa=0.25)
    d.arrow("r", "ko", "RecordError · aborted ·\nattempts ≥ maxAttempts (2)", sides=("r", "l"), fa=0.8, lpos=0.5)
    d.arrow("r", "q", "retry (crash / timeout) · lease expired\n· release() on graceful shutdown", sides=("b", "b"), fa=0.5, fb=0.5, via=[(580, 1660), (190, 1660)], lpos=0.5)

    # failure matrix
    d.zone(1230, 1360, 1160, 520, "Failure handling", "red")
    fails = [
        ("Web instance dies", "stateless: LB reroutes; submit is idempotent"),
        ("Worker killed (kill -9, OOM)", "lease expires → another worker reclaims"),
        ("Postgres stalls ~30 s", "worker aborts at 80% of lease; job re-runs"),
        ("Postgres down for an hour", "queue holds every job; delayed, not lost"),
        ("Object storage outage", "publish fails → retry republishes; index untouched"),
        ("LLM provider down", "gateway fallback chain to the next provider"),
        ("Bad input (RecordError)", "failed at once; not retried, no retry storm"),
        ("Job over 6 min", "deadline aborts the browser; one retry"),
    ]
    fy = 1430
    for i, (k, v) in enumerate(fails):
        col = i % 2
        row = i // 2
        d.box(d._id("f"), 1260 + col * 560, fy + row * 105, 540, 90, f"{k}\n{v}", "white", fs=15)
    d.save()


# ============================================================================ 3. HLD
def hld():
    d = Diagram("03-hld")
    d.text("Walkcast — High-level design (HLD)", 40, 20, 36)
    d.text("Layers and the components in each, by module. Arrows show the main dependencies; every box names the code that implements it.", 40, 72, 16, MUTED)

    W = 2160
    d.zone(20, 120, W, 170, "1 · Clients", "grey")
    d.box("c1", 60, 170, 380, 90, "Visitor browser\npublic pages, no JS needed", "yellow", fs=15)
    d.box("c2", 480, 170, 380, 90, "Signed-in browser\ndashboard SPA (dashboard/src)", "yellow", fs=15)
    d.box("c3", 900, 170, 380, 90, "CLI · src/cli.ts — record · run · check\nruns layer 3 in-process, no web tier", "yellow", fs=15)
    d.box("c4", 1320, 170, 380, 90, "CI gate\nnpm run lab -- check (fixtures/)", "yellow", fs=15)
    d.box("c5", 1740, 170, 400, 90, "Crawlers & answer engines\nrobots.txt · sitemap · llms.txt", "grey", fs=15)

    d.zone(20, 330, W, 250, "2 · Edge & web tier (stateless)", "green", key="webz", right=True)
    d.box("e1", 60, 380, 300, 170, "Static CDN\nsite/prerender.ts\ndeploy/vercel-build.ts\n19 HTML pages + assets", "blue", fs=15)
    d.box("e2", 400, 380, 300, 170, "HTTP router\nui/server.ts createApp()\nsecurity headers\norigin check · /healthz\n/readyz (drain)", "green", fs=15)
    d.box("e3", 740, 380, 320, 170, "Auth\nsite/auth.ts (scrypt, Google)\nsite/supabase-auth.ts\nsession cookie → sha256\nsign-in throttling", "green", fs=15)
    d.box("e4", 1100, 380, 320, 170, "Job API\n/api/record · /api/run\nvalidate · quota · seal\nenqueueLimited → 202\n/api/jobs/:id (ETag)", "green", fs=15)
    d.box("e5", 1460, 380, 320, 170, "Read APIs\nui/data.ts: runs · fixtures\nexperiments · audit\n/files/* (owner-scoped)", "green", fs=15)
    d.box("e6", 1820, 380, 320, 170, "Public site\nsite/pages.ts · guides.ts\nfacts.ts (lab numbers\nfrom results/)", "green", fs=15)

    d.zone(20, 620, W, 510, "3 · Domain services (inside a worker process, or in-process locally)", "orange")
    d.box("j", 60, 690, 380, 200, "Job runtime\njobs/worker.ts — claim, lease,\nheartbeat, deadline, retry\njobs/progress.ts — 1/s throttle\njobs/secret-box.ts — AES-256-GCM", "orange", fs=15)
    d.box("rcd", 480, 690, 420, 200, "Recording\nrecord/site.ts — sign in, BFS walk\nrecord/ssrf.ts — private-IP guard\nrecord/narration.ts — captions\nrecord/media.ts · voice.ts — flite, mux\nrecord/browser.ts — warm Chromium", "orange", fs=15)
    d.box("cap", 940, 690, 360, 200, "Capture\ncapture/recorder.ts — one clock,\nbefore/after state, network\ncapture/tools.ts — BrowserTools\ncapture/secrets.ts — scrubber", "orange", fs=15)
    d.box("lab", 1340, 690, 420, 200, "Lab\nlab/runner.ts — runOnce()\nlab/classifier.ts — causes\nlab/diff.ts · fixture.ts — replay\nlab/experiment.ts · stats.ts (Wilson)\nlab/report.ts", "orange", fs=15)
    d.box("app", 1800, 690, 340, 200, "Application under test\nstartApp(fault, seed)\napp/server.ts — MiniCRM\napp/faults.ts — injected\nfaults, seeds, ledger", "orange", fs=15)
    d.box("llm", 900, 930, 440, 170, "LLM gateway  llm/\ngateway.ts — live · replay · scripted\nmodel-spec.ts — fallback chains\nproviders.ts — 15+ routes · claude.ts\ncredentials.ts — per-job keys (ALS)", "orange", fs=14)
    d.box("ag", 1440, 930, 320, 170, "Agents  agents/ → generate()\nregistry.ts\nscripted.ts — v0 / v1 / v2\nstagehand-agent.ts\n(Stagehand v4, tool calling)", "orange", fs=14)

    d.zone(20, 1170, W, 240, "4 · State & infrastructure adapters", "violet", key="statez", right=True)
    d.box("st", 60, 1220, 520, 160, "Store interface (store/types.ts)\nFileStore — .lab/store.json, one process\nPgStore — Supabase Postgres, shared\nusers · sessions · rate_limits · jobs · recordings", "violet", fs=15)
    d.box("md", 620, 1220, 460, 160, "MediaStore (media/store.ts)\nLocalMedia — recordings/<id>/\nS3Media — SigV4 PUT + presigned GET\n(media/s3.ts)", "violet", fs=15)
    d.box("fs", 1120, 1220, 460, 160, "Workspace files\nruns/ · fixtures/ · results/\nrecordings/ (local)\nmodel-calls.jsonl cassettes", "violet", fs=15)
    d.box("ops", 1620, 1220, 520, 160, "Ops\nops/log.ts — JSON lines\n/api/metrics — queue depth, oldest\nwait, p50 / p95 per job kind\nenv.ts — .env loader", "violet", fs=15)

    d.zone(20, 1450, W, 170, "5 · External", "red")
    d.box("x1", 60, 1500, 400, 90, "Target websites (authorized)", "red", fs=16)
    d.box("x2", 500, 1500, 400, 90, "Chromium · Chrome for Testing", "grey", fs=16)
    d.box("x3", 940, 1500, 400, 90, "ffmpeg + flite", "grey", fs=16)
    d.box("x4", 1380, 1500, 360, 90, "LLM providers", "red", fs=16)
    d.box("x5", 1780, 1500, 360, 90, "Google · Supabase · OAuth", "red", fs=16)

    d.arrow("c1", "e1", "GET pages", sides=("b", "t"), fa=0.3, fb=0.53)
    d.arrow("c2", "e2", "/app · /api", sides=("b", "t"), fa=0.2, fb=0.6)
    d.arrow("c4", "lab", "replay fixtures in CI", sides=("t", "t"), fa=0.5, fb=0.7, via=[(1510, 106), (2200, 106), (2200, 600), (1634, 600)], dashed=True, lpos=0.62)
    d.arrow("e2", "e3", None, sides=("r", "l"), fa=0.3, fb=0.3)
    d.arrow("e3", "e4", None, sides=("r", "l"), fa=0.3, fb=0.3)
    d.arrow("webz", "statez", "web tier → state directly:\nsessions · quotas · enqueue ·\njob status · locate media", sides=("r", "r"), fa=0.5, fb=0.4, via=[(2300, 455), (2300, 1266)], lpos=0.5, fs=13)
    d.arrow("j", "rcd", None, sides=("r", "l"), fa=0.3, fb=0.3)
    d.arrow("j", "lab", "run", sides=("t", "t"), fa=0.85, fb=0.5, via=[(383, 668), (1550, 668)], lpos=0.6)
    d.arrow("rcd", "cap", None, sides=("r", "l"), fa=0.5, fb=0.5)
    d.arrow("lab", "cap", None, sides=("l", "r"), fa=0.75, fb=0.75)
    d.arrow("lab", "app", None, sides=("r", "l"), fa=0.5, fb=0.5)
    d.arrow("lab", "ag", "session", sides=("b", "t"), fa=0.6, fb=0.5)
    d.arrow("ag", "llm", None, sides=("l", "r"), fa=0.5, fb=0.5)
    d.arrow("j", "st", "claim · finish", sides=("b", "t"), fa=0.5, fb=0.37)
    d.arrow("rcd", "md", "publish", sides=("b", "t"), fa=0.7, fb=(774 - 620) / 460)
    d.arrow("lab", "fs", "result.json · cassette", sides=("b", "t"), fa=0.1, fb=(1382 - 1120) / 460, fs=13, lpos=0.75, via=[(1382, 1140)])
    d.save()

# ============================================================================ 4. LLD
def lld():
    d = Diagram("04-lld")
    d.text("Walkcast — Low-level design (LLD)", 40, 20, 36)
    d.text("Data model, the two job pipelines step by step, and the interfaces the web tier and workers share.", 40, 72, 16, MUTED)

    # ---------- ERD
    d.zone(20, 120, 1100, 780, "A · Data model (supabase/migrations · store/pg-store.ts)", "violet")
    d.box("users", 60, 190, 320, 300, "users\n──────────\nid  text  PK\nemail  unique(lower)\nname\npassword_hash  scrypt$N$salt$hash\ngoogle_sub  unique\nauth_id  (Supabase Auth)\nopenrouter_key  sealed\nchatgpt  sealed tokens\ncreated_at", "white", fs=14)
    d.box("sessions", 60, 560, 320, 150, "sessions\n──────────\ntoken_hash  PK (sha256)\nuser_id  FK → users\nexpires_at  (indexed)", "white", fs=14)
    d.box("rl", 60, 750, 320, 120, "rate_limits\n──────────\nkey  PK  'quota:record:<user>'\nwindow_start · count", "white", fs=14)
    d.box("jobs", 460, 190, 340, 470, "jobs\n──────────\nid  uuid  PK\nkind  record | run\nowner  FK → users\nstatus  queued | running |\n  succeeded | failed | cancelled\ninput  jsonb\nsecret  sealed, cleared at end\nresult jsonb · error · progress\nattempts · max_attempts (2)\nidempotency_key\n  unique(owner, key)\nlocked_by · lease_until\ncreated · started · finished", "white", fs=14)
    d.box("recs", 460, 700, 340, 170, "recordings\n──────────\nid  text  PK  <host>-<ts><rand>\nowner  FK → users\nurl · created_at\nsummary  jsonb (pages,\ncaptions, sign-in, media)", "white", fs=14)
    d.box("idx", 840, 190, 250, 300, "Indexes\n──────────\njobs_queue_idx\n(created_at)\nwhere queued\n\njobs_lease_idx\n(lease_until)\nwhere running\n\njobs_owner_idx\nrecordings_owner_idx", "grey", fs=14)
    d.box("rls", 840, 540, 250, 150, "RLS enabled on all\ntables; anon and\nauthenticated roles\nrevoked: only the\nserver role reads", "grey", fs=14)
    d.arrow("sessions", "users", "user_id", sides=("t", "b"))
    d.arrow("jobs", "users", "owner", sides=("l", "r"), fa=0.15, fb=0.3)
    d.arrow("recs", "users", "owner", sides=("l", "r"), fa=0.3, fb=0.8, via=[(420, 751), (420, 430)], lpos=0.5)

    # ---------- interfaces
    d.zone(1160, 120, 1100, 780, "B · Shared interfaces", "green")
    d.box("store", 1200, 190, 500, 420, "interface Store (store/types.ts)\n──────────\nuserByEmail · userById · userByGoogle · userByAuthId\ninsertUser (DuplicateError) · updateUser\ncreateSession · sessionUser · deleteSession\nhit(key, windowMs) → count\nenqueue(job) · enqueueLimited(job, maxActive)\nclaim(workerId, leaseMs, kind?)\nheartbeat · setProgress · finish (fenced)\nrelease (no attempt counted)\njob · jobByKey · activeJobs\nqueueDepth · queuePosition · queueStats\nmetrics(windowMs) → p50 / p95\nsaveRecording · recordings · recording\nping · close", "white", fs=14)
    d.box("fstore", 1200, 650, 240, 210, "FileStore\none JSON file\natomic rename\n(retry on EPERM)\nin-process mutex\nsingle process only", "teal", fs=14)
    d.box("pgs", 1460, 650, 240, 210, "PgStore\npostgres.js, 0 prepared\nstatements (pooler)\nSKIP LOCKED claim\nretirement sweep of\nexhausted leases", "teal", fs=14)
    d.box("media", 1740, 190, 480, 200, "interface MediaStore (media/store.ts)\n──────────\npublish(id, localDir, files)\nlocate(id, file) → {path} | {redirect} | null\nLocalMedia — recordings/<id>/\nS3Media — SigV4 PUT, presigned GET 15 min", "white", fs=14)
    d.box("worker", 1740, 430, 480, 430, "class Worker (jobs/worker.ts)\n──────────\nid = host-pid-uuid8\nstart() · poke() · stop(graceMs = 30 s)\nrun(): claim → execute | idle backoff\n  2 s ×2 → 10 s, ±10% jitter\nexecute(job):\n  heartbeat every max(1 s, lease/3)\n  margin check: abort if no ack > 80% lease\n  deadline LAB_JOB_DEADLINE_MS (6 min)\n  finish: flush progress, then fenced write\n  retry unless RecordError or aborted\n  finally: unregister site secrets\nrecord(job) · labRun(job)\n  withCredentials(owner keys) per run", "white", fs=14)
    d.arrow("fstore", "store", "implements", sides=("t", "b"), fb=0.25, dashed=True)
    d.arrow("pgs", "store", "implements", sides=("t", "b"), fb=0.75, dashed=True)

    # ---------- record pipeline
    d.zone(20, 940, 2240, 360, "C · Record pipeline — recordSite() (record/site.ts)", "orange")
    steps = [
        ("s1", "1  Validate\nauthorized? http(s)?\nblockPrivate → ssrf\nmaxPages ∈ 1..50"),
        ("s2", "2  Register secrets\nsite_password ·\nsite_username for\nthe scrubber"),
        ("s3", "3  Context\nwarm Chromium\n1280×800 + video\nservice workers off\nguardContext (SSRF)"),
        ("s4", "4  browse()\nrobots.txt disallow\nsignInFlow: detect\nform, CAPTCHA, MFA\nBFS same-origin links"),
        ("s5", "5  NarratedTools\neach action held\nfor its spoken\nlength (speechMs)"),
        ("s6", "6  captionsFor\n(trace events)\nevent → sentence\npassword never read"),
        ("s7", "7  buildMedia\nflite per line\n(per-clip deadline)\nmux MP4 + WebM\nWAV · VTT"),
        ("s8", "8  scrub(result)\n→ recording.json\nvalues → {{secret}}"),
    ]
    for i, (k, label) in enumerate(steps):
        d.box(k, 50 + i * 278, 1010, 250, 180, label, "orange" if i not in (4, 5) else "yellow", fs=14)
        if i:
            d.arrow(steps[i - 1][0], k, None, sides=("r", "l"))
    d.text("Worker then: media.publish(files) → store.saveRecording(row) → finish(succeeded). Errors the user can fix throw RecordError (not retried).", 50, 1220, 15, MUTED)

    # ---------- lab pipeline
    d.zone(20, 1330, 2240, 380, "D · Lab run pipeline — runOnce() (lab/runner.ts)", "blue")
    lsteps = [
        ("l1", "1  resolveAgent\nscripted v0/v1/v2\nor Stagehand sh-p*"),
        ("l2", "2  startApp\nMiniCRM on a free\nport with fault +\nseed + task leads"),
        ("l3", "3  openSession\nscripted: shared\nbrowser · Stagehand:\nModelGateway(mode)"),
        ("l4", "4  session.run\n(BrowserTools, task)\nRecorder: before /\nafter state, network"),
        ("l5", "5  evaluateOracle\nreads app.state,\nnot the agent's\nclaim"),
        ("l6", "6  diagnose\ndeterministic rules\ncite steps; else\n'unexplained'"),
        ("l7", "7  write\nresult.json (scrubbed)\nmodel-calls.jsonl\nreport"),
        ("l8", "8  fixture / replay\ncassette + seed +\ntimings → regression\ncheck in CI"),
    ]
    for i, (k, label) in enumerate(lsteps):
        d.box(k, 50 + i * 278, 1400, 250, 180, label, "blue", fs=14)
        if i:
            d.arrow(lsteps[i - 1][0], k, None, sides=("r", "l"))
    d.text("Gateway modes: live (provider backends with fallback chains) · replay (cassette, element ids remapped) · scripted (offline ScriptedModel). Keys come from llm/credentials.ts scope, never process.env mutation.", 50, 1610, 15, MUTED)
    d.text("Experiments repeat runs over seeds × faults × agents and report Wilson 95% intervals (lab/stats.ts); diff.ts compares a candidate against a baseline.", 50, 1640, 15, MUTED)
    d.save()


if __name__ == "__main__":
    overview()
    system_design()
    hld()
    lld()
    print("written to", OUT)
