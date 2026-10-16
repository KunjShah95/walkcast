import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Walkcast look, shared by the marketing site (apps/web) and the pages the desktop app
 * serves itself (sign-in, 404): the name, the mark, one stylesheet, the drawn icons and the
 * self-hosted fonts. No routes and no copy beyond the name live here.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const NAME = "Walkcast";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const FONTS = `
@font-face{font-family:"Schibsted Grotesk";src:url(/assets/fonts/schibsted-grotesk.woff2) format("woff2");font-weight:400 900;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(/assets/fonts/jetbrains-mono.woff2) format("woff2");font-weight:100 800;font-display:swap}`;

/*
  The app's case file, opened up for a visitor. White paper, ink, and the app's two signals:
  ochre for "record this" and for evidence (an EX tag, a cited line), red only for the record
  light, green only for a page that answered 200. Headlines run in two tones (the claim in ink, the
  consequence in the dim ink) with a drawn icon tile set in the line. The whole site is light: white
  paper, and the recorder window is a white panel in a soft grey ring. Schibsted Grotesk sets every size;
  JetBrains Mono is only for timecodes, file names, URLs and counts.
*/

export const CSS = `${FONTS}
:root{--paper:#ffffff;--panel:#ffffff;--panel-2:#f5f4f1;--panel-3:#eae8e3;--ink:#1b1a17;--ink-2:#4c4841;--muted:#6b665d;--dim:#8a847a;--line:#e7e3db;--line-strong:#cfc9bd;--signal:#9c5700;--signal-strong:#874b00;--signal-soft:#f4e7d2;--on-signal:#ffffff;--exhibit:#f1dfbd;--exhibit-ink:#5c3400;--exhibit-soft:#f8efdf;--rec:#c0321c;--fail:#b2261c;--pass:#2c6a3d;--solid:#1b1a17;--on-solid:#ffffff;
--r:14px;--r-lg:22px;--r-sm:8px;--pill:999px;--ease:cubic-bezier(.22,1,.36,1);--sans:"Schibsted Grotesk",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;color-scheme:light}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:84px}
::selection{background:var(--exhibit);color:var(--exhibit-ink)}
input,textarea{caret-color:var(--signal)}
::-webkit-scrollbar{width:11px;height:11px}::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:var(--pill);border:3px solid transparent;background-clip:padding-box}
*{scrollbar-color:var(--line-strong) transparent;scrollbar-width:thin}
:focus-visible{outline:2px solid var(--signal);outline-offset:3px;border-radius:4px}
body{margin:0;background:var(--paper);color:var(--ink);font:16.5px/1.6 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:"ss01"}
a{color:inherit;text-underline-offset:3px}img,video{max-width:100%;display:block}
.wrap{max-width:1240px;margin:0 auto;padding:0 max(20px,env(safe-area-inset-left))}
.narrow{max-width:860px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.skip{position:fixed;left:12px;top:-60px;z-index:50;background:var(--solid);color:var(--on-solid);padding:10px 14px;border-radius:var(--pill);font-size:14px;text-decoration:none;transition:top .2s var(--ease)}
.skip:focus{top:12px}
.ic{flex:none}

/* Type: two tones in one headline, and a drawn tile set into the line. */
h1,h2,h3{font-family:var(--sans);font-weight:700;margin:0;text-wrap:balance;color:var(--ink)}
h1{font-size:clamp(46px,7.4vw,100px);line-height:.98;letter-spacing:-.04em}
h2{font-size:clamp(34px,4.9vw,64px);line-height:1.02;letter-spacing:-.04em}
h3{font-size:18px;line-height:1.3;letter-spacing:-.012em}
.dim{color:var(--dim)}
.tile{display:inline-grid;place-items:center;width:.86em;height:.86em;margin:0 .06em;border-radius:.24em;vertical-align:-.1em;transform:rotate(-5deg);color:#fff;background:var(--solid)}
.tile.tilt{transform:rotate(6deg)}
.tile svg{width:.52em;height:.52em}
.t-ink{background:#1b1a17;color:#fff}.t-signal{background:#9c5700;color:#fff}.t-rec{background:#c0321c;color:#fff}.t-pass{background:#2c6a3d;color:#fff}.t-exhibit{background:#f1dfbd;color:#5c3400}
.lede{font-size:clamp(17px,1.55vw,20px);line-height:1.55;color:var(--muted);max-width:50ch;margin:24px auto 0;text-wrap:pretty}
.center{text-align:center}
.center .lede{margin-left:auto;margin-right:auto;max-width:66ch}

/* Chrome. */
header.top{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:28px;height:64px}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;font:700 18px/1 var(--sans);letter-spacing:-.03em}
.brand svg{flex:none}
.nav-main{display:flex;gap:4px}
.nav-main a,.nav-end a:not(.pill){font-size:14.5px;text-decoration:none;color:var(--muted);padding:8px 10px;border-radius:var(--pill);transition:color .18s,background-color .18s}
.nav-main a:hover,.nav-end a:not(.pill):hover{color:var(--ink);background:var(--panel-2)}
.nav-main a[aria-current="page"],.nav-end a[aria-current="page"]:not(.pill){color:var(--ink)}
.nav-end{display:flex;align-items:center;gap:6px;margin-left:auto}

/* Buttons are pills. Solid ink for "go", ochre for the record action, grey for the rest. */
.pill{display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:var(--pill);background:var(--panel-2);color:var(--ink);font:600 14.5px/1 var(--sans);padding:11px 18px;text-decoration:none;cursor:pointer;white-space:nowrap;transition:background-color .18s,transform .18s var(--ease),color .18s}
.pill:hover{background:var(--panel-3)}
.pill:active{transform:scale(.98)}
.pill.solid{background:var(--solid);color:var(--on-solid)}
.pill.solid:hover{background:color-mix(in srgb,var(--solid) 86%,var(--paper))}
.pill.rec{background:var(--signal);color:var(--on-signal)}
.pill.rec:hover{background:var(--signal-strong)}
.pill.rec::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--rec);box-shadow:0 0 0 2px color-mix(in srgb,var(--on-signal) 90%,transparent)}
.pill.big{font-size:16px;padding:15px 24px}
.pill.ghost{background:transparent;box-shadow:inset 0 0 0 1px var(--line-strong)}
.pill.ghost:hover{background:var(--panel-2)}
.pill[aria-disabled="true"]{opacity:.5;cursor:not-allowed}
.textlink{color:var(--ink);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.textlink:hover{color:var(--signal)}
.textlink .ic{transition:transform .2s var(--ease)}
.textlink:hover .ic{transform:translateX(3px)}

/* The link field: one pill holding the input and the record action. */
.urlform{display:flex;align-items:center;gap:6px;width:min(600px,100%);margin:34px auto 0;padding:6px 6px 6px 20px;background:var(--panel);border-radius:var(--pill);box-shadow:inset 0 0 0 1px var(--line-strong),0 1px 2px rgb(27 26 23/.04);transition:box-shadow .2s}
.urlform .ic{color:var(--dim)}
.urlform input{flex:1;min-width:0;border:0;background:transparent;font:15px var(--mono);color:var(--ink);padding:12px 4px;outline:none}
.urlform input::placeholder{color:var(--muted);opacity:1}
.urlform:focus-within{box-shadow:inset 0 0 0 2px var(--signal),0 0 0 5px var(--signal-soft)}
.fineprint{margin:16px 0 0;font-size:14px;color:var(--muted)}
.fineprint b{color:var(--ink);font-weight:600}

/* The recorder window: a white panel set in a soft grey ring, like a product shot. */
.frame{margin:clamp(48px,6vw,80px) auto 0;padding:clamp(8px,1.2vw,16px);border-radius:calc(var(--r-lg) + 12px);background:var(--panel-2);box-shadow:inset 0 0 0 1px var(--line),0 40px 80px -48px rgb(27 26 23/.45)}
.win{border-radius:var(--r-lg);overflow:hidden;background:var(--paper);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line);text-align:left}
.win-bar{display:flex;align-items:center;gap:14px;height:46px;padding:0 16px;border-bottom:1px solid var(--line)}
.lights{display:flex;gap:7px}.lights i{width:11px;height:11px;border-radius:50%;background:var(--panel-3)}
.lights i:nth-child(1){background:#ef6a55}.lights i:nth-child(2){background:#e0a14a}.lights i:nth-child(3){background:#79c18c}
.win-title{font-size:12.5px;color:var(--muted)}
.win-meta{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--muted)}
.live{display:inline-flex;align-items:center;gap:6px;font:700 11px/1 var(--sans);letter-spacing:.06em;color:#fff;background:#c0321c;padding:5px 8px;border-radius:6px}
.live::before{content:"";width:6px;height:6px;border-radius:50%;background:#fff}
.win-body{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(0,1fr)}
.screen{margin:0;padding:14px;display:flex;flex-direction:column;gap:12px;border-right:1px solid var(--line);min-width:0}
.screen video{width:100%;aspect-ratio:16/10;background:#000;border-radius:10px}
.chapters{display:flex;gap:3px;height:22px;align-items:center}
.chapters button{flex:1 1 0;min-width:4px;height:100%;padding:0;border:0;background:transparent;cursor:pointer;position:relative}
.chapters button::after{content:"";position:absolute;left:0;right:0;top:50%;height:5px;margin-top:-2.5px;border-radius:3px;background:var(--panel-3);transition:background-color .2s,height .2s,margin .2s}
.chapters button:hover::after{height:9px;margin-top:-4.5px}
.chapters button.done::after{background:color-mix(in srgb,var(--signal) 55%,var(--panel-3))}
.chapters button.on::after{background:var(--signal)}
.screen-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font-size:12.5px;color:var(--muted)}
.screen-meta .mono{color:var(--ink-2)}
.screen-meta .ok{color:var(--pass)}
.transcript{display:flex;flex-direction:column;min-height:0;min-width:0}
.transcript header{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:16px 18px 10px}
.transcript header p{margin:0;font-size:15px;font-weight:700;letter-spacing:-.01em;line-height:1.3;color:var(--ink)}
.transcript header span{font-size:12.5px;color:var(--muted)}
.transcript ol{position:relative;list-style:none;margin:0;padding:0 8px 36px;overflow:auto;max-height:440px;flex:1;-webkit-mask-image:linear-gradient(#000 calc(100% - 56px),transparent);mask-image:linear-gradient(#000 calc(100% - 56px),transparent)}
.transcript li button>span{min-width:0;overflow-wrap:anywhere}
.transcript li button{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:baseline;width:100%;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:var(--ink-2);font:14px/1.45 var(--sans);text-align:left;cursor:pointer;transition:background-color .2s,color .2s}
.transcript li button:hover{background:var(--panel-2);color:var(--ink)}
.transcript time{font:11.5px var(--mono);color:var(--muted)}
.tag{display:inline-block;font:600 11.5px/1 var(--mono);letter-spacing:.02em;padding:4px 6px;border-radius:5px;background:var(--panel-2);color:var(--muted);white-space:nowrap}
.transcript li.on button{background:var(--exhibit-soft);color:var(--ink)}
.transcript li.on .tag{background:var(--exhibit);color:var(--exhibit-ink)}
.transcript li.on time{color:var(--signal)}
.transcript li.spot button{animation:spot 1.8s var(--ease)}
@keyframes spot{0%{box-shadow:inset 0 0 0 2px var(--signal);background:var(--exhibit)}100%{box-shadow:inset 0 0 0 0 transparent}}
.win-foot{display:flex;align-items:center;gap:8px;padding:12px 40px 12px 14px;border-top:1px solid var(--line);overflow-x:auto;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 48px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 48px),transparent)}
.win-foot>span{font-size:12.5px;color:var(--muted);margin-right:4px;white-space:nowrap}
.pagechip{display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border:0;border-radius:9px;background:var(--panel-2);color:var(--ink-2);font:12.5px var(--mono);cursor:pointer;white-space:nowrap;transition:background-color .18s,color .18s}
.pagechip:hover{background:var(--panel-3);color:var(--ink)}
.pagechip b{font-weight:500;color:var(--pass)}

/* Citations: a claim in the copy points at the line in the recording that proves it. */
.cite{display:inline-flex;align-items:center;gap:5px;vertical-align:1px;margin-left:3px;font:600 11px/1 var(--mono);text-decoration:none;color:var(--exhibit-ink);background:var(--exhibit);padding:4px 7px;border-radius:6px;white-space:nowrap;transition:background-color .18s,transform .18s var(--ease)}
.cite::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.55}
.cite:hover{background:color-mix(in srgb,var(--exhibit) 80%,var(--signal))}

/* Sections: generous air, one rhythm. */
.sec{padding:clamp(88px,11vw,152px) 0 0}
.sec.first{padding-top:clamp(56px,8vw,104px)}
.sec-head{max-width:900px}
.sec-head.center{max-width:none;text-align:center}
.sec-head .lede{margin-left:0;max-width:none}
.sec-head.center .lede{margin-left:auto}
.belt{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 34px;margin:44px 0 0;padding:0;list-style:none}
.belt li{display:flex;align-items:center;gap:9px;font:500 15.5px var(--mono);color:var(--muted)}
.belt .ic{color:var(--ink-2)}
.belt li.sans{font-family:var(--sans)}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:30px 0 0;padding:0;list-style:none}
.chips li{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--ink-2);padding:9px 15px 9px 13px;border-radius:var(--pill);background:var(--panel-2)}
.feats{display:grid;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:40px 32px;margin:clamp(48px,6vw,72px) 0 0;padding:0;list-style:none}
.feats li{padding-top:24px;border-top:1px solid var(--line)}
.feats .ic{color:var(--ink)}
.feats h3{margin:18px 0 8px}
.feats p{margin:0;font-size:15px;color:var(--muted);text-wrap:pretty}
.feats.on-panel li{border-color:var(--line-strong)}
.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:clamp(40px,6vw,96px);align-items:center}
.split.top{align-items:start}
.split h2{font-size:clamp(32px,4vw,54px)}
.answer{font-size:clamp(18px,1.6vw,20px);line-height:1.55;color:var(--ink-2);margin:26px 0 0;max-width:52ch;text-wrap:pretty}
.meta{font-size:13.5px;color:var(--muted);margin:16px 0 0}
.panel{background:var(--panel-2);border-radius:var(--r-lg);padding:clamp(18px,2.4vw,28px)}
.card{background:var(--panel);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line);padding:22px}

/* Specimens: each output file shown as itself. */
.specs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:clamp(48px,6vw,72px) 0 0;align-items:start}
.spec{display:flex;flex-direction:column;gap:18px;background:var(--panel-2);border-radius:var(--r-lg);padding:14px 14px 22px}
.spec .body{padding:0 8px}
.spec .file{display:inline-flex;align-items:center;gap:7px;font:500 12.5px var(--mono);color:var(--muted)}
.spec h3{margin:8px 0 6px}
.spec p{margin:0;font-size:15px;color:var(--muted)}
.spec .view{background:var(--panel);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.spec .poster{position:relative}
.spec .poster img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:top}
.spec .poster span{position:absolute;left:12px;bottom:12px;font:500 12px var(--mono);color:#fff;background:rgb(0 0 0/.62);padding:5px 8px;border-radius:6px}
.vtt{margin:0;padding:16px;font:12.5px/1.65 var(--mono);color:var(--ink-2);white-space:pre-wrap;overflow-wrap:anywhere}
.vtt b{font-weight:500;color:var(--muted)}
.quote{padding:18px;font-size:15px;line-height:1.5;color:var(--ink)}
.quote small{display:block;margin-top:10px;font:12px var(--mono);color:var(--muted)}
.pages{list-style:none;margin:0;padding:6px 16px;font:13px var(--mono)}
.pages li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);color:var(--ink-2)}
.pages li:first-child{border-top:0}
.pages b{font-weight:500;color:var(--pass)}

/* The lab ledger: measured counts, each with its own row of marks. */
.ledger{display:grid;gap:0;background:var(--panel);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line);padding:4px 22px}
.statcell{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:20px 0;border-top:1px solid var(--line)}
.statcell:first-child{border-top:0}
.stat{font:600 clamp(28px,3vw,38px)/1 var(--mono);letter-spacing:-.04em;color:var(--ink)}
.stat small{display:block;margin-top:10px;font:15px/1.5 var(--sans);letter-spacing:0;color:var(--muted);max-width:52ch}
.marks{display:flex;flex-wrap:wrap;gap:3px}
.ledger-note{margin:0;padding:16px 0 18px;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
.marks i{width:9px;height:9px;border-radius:2px;background:var(--panel-3)}
.marks.pass i.on{background:var(--pass)}
.marks.fail i.on{background:var(--fail)}

/* Tables, FAQ, sources. */
.tablewrap{margin-top:clamp(40px,5vw,60px);border-radius:var(--r-lg);background:var(--panel);box-shadow:inset 0 0 0 1px var(--line);overflow-x:auto}
.compare{width:100%;border-collapse:collapse;font-size:15px}
.compare caption{caption-side:bottom;text-align:left;font-size:13px;color:var(--muted);padding:14px 24px}
.compare th,.compare td{text-align:left;vertical-align:top;padding:18px 24px;border-top:1px solid var(--line)}
.compare thead th{font-size:13px;font-weight:600;color:var(--muted);border-top:0;background:var(--panel-2)}
.compare thead th:nth-child(2){color:var(--signal)}
.compare tbody th{font-weight:600;color:var(--ink);width:22%}
.compare td:nth-child(2){color:var(--ink)}
.compare td:nth-child(3){color:var(--muted)}
.faq-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(32px,6vw,96px);align-items:start}
.faq-grid>div:first-child{position:sticky;top:96px}
.faq-grid .lede{margin:18px 0 0}
.help{margin-top:32px;background:var(--panel-2);border-radius:var(--r);padding:20px 22px}
.help h3{font-size:18px}
.help p{margin:6px 0 16px;font-size:14px;color:var(--muted)}
.faq{display:grid;gap:8px}
.faq details{background:var(--panel-2);border-radius:var(--r);transition:background-color .2s,box-shadow .2s}
.faq details[open]{background:var(--panel);box-shadow:inset 0 0 0 1px var(--line),0 12px 28px -20px rgb(27 26 23/.35)}
.faq summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;padding:18px 20px;cursor:pointer;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary h3{font-size:16.5px;font-weight:600;line-height:1.35;margin:0}
.faq summary .tog{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--panel);color:var(--ink);transition:transform .25s var(--ease),background-color .2s,color .2s}
.faq details[open] .tog{transform:rotate(45deg);background:var(--solid);color:var(--on-solid)}
.faq details p{margin:0;padding:0 64px 20px 20px;color:var(--muted);font-size:15.5px}
.sources{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:0}
.sources li{padding:14px 0;border-top:1px solid var(--line);color:var(--muted);font-size:14.5px}
.sources a{color:var(--ink);font-weight:600;text-decoration-color:var(--line-strong)}
.sources a:hover{text-decoration-color:var(--signal)}
.src-block{margin-top:clamp(56px,7vw,88px)}
.src-block h2{font-size:28px;letter-spacing:-.03em}

/* Guides as a grid of jobs. */
.guide-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(32px,5vw,72px);margin-top:clamp(40px,5vw,60px)}
.guide-list a{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 20px;align-items:center;padding:22px 0;border-top:1px solid var(--line);text-decoration:none}
.guide-list a h3{font-size:19px;transition:color .18s}
.guide-list a p{grid-column:1;margin:0;font-size:15px;color:var(--muted);max-width:60ch;text-wrap:pretty}
.guide-list .more{grid-column:2;grid-row:1/span 2;display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--panel-2);color:var(--ink);font-size:0;transition:background-color .2s,color .2s,transform .25s var(--ease)}
.guide-list a:hover h3{color:var(--signal)}
.guide-list a:hover .more{background:var(--solid);color:var(--on-solid);transform:translateX(3px)}

/* Steps written out in order (how a recording runs, how the lab works). */
ol.howto{list-style:none;margin:0;padding:0;counter-reset:h;display:grid;gap:8px}
ol.howto li{counter-increment:h;display:grid;grid-template-columns:44px minmax(0,1fr);gap:4px 14px;padding:20px 22px;border-radius:var(--r);background:var(--panel-2);color:var(--muted)}
ol.howto li::before{content:counter(h);display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--panel);font:600 13px var(--mono);color:var(--ink);grid-row:span 2}
ol.howto strong{color:var(--ink);font-weight:600}

/* The close. */
.close{padding:clamp(104px,13vw,176px) 0 clamp(72px,9vw,120px);text-align:center}
.close .lede{max-width:66ch}
.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:34px}
.code{max-width:100%;overflow-x:auto;margin:24px 0 0;padding:18px 20px;border-radius:var(--r);background:var(--panel-2);font:14px/1.7 var(--mono);color:var(--ink)}

/* Footer: columns, then the name, very large and very quiet. */
.foot{margin-top:clamp(40px,5vw,72px);border-top:1px solid var(--line);overflow:hidden}
.foot-grid{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(4,minmax(0,1fr));gap:36px 28px;padding:56px 0 48px}
.foot-brand p{margin:14px 0 20px;color:var(--muted);font-size:15px;max-width:30ch}
.foot-meta{display:block;margin-top:16px;font-size:13px;color:var(--muted)}
.foot-h{font-size:14px;font-weight:600;color:var(--ink);margin:0 0 14px}
.foot ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.foot ul a{font-size:14.5px;color:var(--muted);text-decoration:none}
.foot ul a:hover{color:var(--ink)}
.foot-base{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;padding:22px 0;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
.foot-base a{color:var(--muted)}
.wordmark{display:block;margin:8px 0 -.2em;font:800 clamp(96px,22vw,320px)/.8 var(--sans);letter-spacing:-.06em;text-align:center;color:var(--panel-3);-webkit-mask-image:linear-gradient(#000 20%,transparent 92%);mask-image:linear-gradient(#000 20%,transparent 92%);user-select:none}

/* Page heads for the inner pages. */
.page-head{padding:clamp(56px,8vw,112px) 0 0;text-align:center}
.page-head h1{font-size:clamp(42px,6.2vw,84px)}
.crumbs{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;font-size:13.5px;color:var(--muted);margin:0 0 26px}
.crumbs a{color:var(--muted);text-decoration:none}
.crumbs a:hover{color:var(--ink)}
.page-head .pill{margin-top:34px}

/* Long-form guides. */
.article{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:clamp(40px,6vw,88px);padding:clamp(40px,5vw,72px) 0 0}
.article h1{font-size:clamp(36px,4.6vw,58px);max-width:20ch}
.article .crumbs{justify-content:flex-start}
.prose{max-width:70ch}
.prose .lede{margin:22px 0 0}
.prose h2{font-size:clamp(26px,2.6vw,34px);letter-spacing:-.03em;margin:60px 0 18px}
.prose p,.prose li{color:var(--ink-2);font-size:17px}
.prose li{margin:6px 0}
.prose strong{color:var(--ink);font-weight:600}
.prose table{border-collapse:collapse;width:100%;font-size:15.5px;background:var(--panel);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.prose td,.prose th{border-top:1px solid var(--line);padding:14px 18px;text-align:left;vertical-align:top}
.prose tr:first-child td,.prose tr:first-child th{border-top:0}
.prose th{width:12rem;font-weight:600;color:var(--ink);font-size:14.5px}
.side{position:sticky;top:96px;align-self:start;display:grid;gap:14px}
.side .card{background:var(--panel-2);box-shadow:none}
.side-h{font-size:15px;font-weight:700;color:var(--ink);margin:0 0 12px}
.side video{width:100%;border-radius:10px;background:#000}
.side .note{margin:10px 0 0;font-size:14px;color:var(--muted)}
.side ul{list-style:none;padding:0;margin:0}
.side li a{display:block;padding:7px 0;text-decoration:none;color:var(--ink-2);font-size:15px}
.side li a:hover{color:var(--signal)}

/* Auth. */
.auth{min-height:calc(100dvh - 65px);display:grid;place-items:center;padding:clamp(20px,4vw,48px) 0}
.auth>.wrap{width:100%;display:grid;justify-items:center}
.auth .pill{white-space:normal;text-align:center}
.auth-shell{width:min(820px,100%);min-width:0;display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1fr);gap:12px;align-items:start}
.auth-story{align-self:start;border-radius:var(--r-lg);background:var(--panel-2);color:var(--ink);padding:24px 22px;display:flex;flex-direction:column;gap:10px}
.auth-story .dh{color:var(--ink);font-weight:700;font-size:clamp(24px,2.6vw,30px);line-height:1.05;letter-spacing:-.035em;margin:0;max-width:14ch}
.auth-story p{color:var(--muted);margin:0;font-size:14.5px;max-width:34ch}
.auth-ex{list-style:none;margin:8px 0 0;padding:4px;display:grid;gap:1px;border-radius:var(--r);background:var(--panel)}
.auth-ex li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:baseline;padding:7px 8px;border-radius:8px;font-size:13px;color:var(--ink-2)}
.auth-ex li:nth-child(2){background:var(--exhibit-soft);color:var(--ink)}
.auth-ex li:nth-child(2) .tag{background:var(--exhibit);color:var(--exhibit-ink)}
.auth-ex time{font:11.5px var(--mono);color:var(--muted)}
.auth-files{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px!important;max-width:none!important}
.auth-files span{font:11.5px var(--mono);color:var(--ink-2);background:var(--panel);padding:4px 8px;border-radius:6px}
.auth-card{background:var(--panel);border-radius:var(--r-lg);box-shadow:inset 0 0 0 1px var(--line);padding:24px 24px 20px}
.auth h1{font-size:28px;letter-spacing:-.03em}
.auth .sub{margin:4px 0 0;color:var(--muted);font-size:14px}
.auth label{display:grid;gap:5px;margin-top:12px;font-size:13px;font-weight:500;color:var(--ink-2)}
.auth input{border:0;box-shadow:inset 0 0 0 1px var(--line-strong);background:var(--paper);color:var(--ink);border-radius:10px;padding:10px 12px;font:15px var(--sans);outline:none;transition:box-shadow .18s}
.auth input:focus{box-shadow:inset 0 0 0 2px var(--signal),0 0 0 4px var(--signal-soft)}
.auth .pill{width:100%;margin-top:8px;padding:10px 16px;font-size:14px}
.auth form .pill{margin-top:16px;padding:12px 16px;font-size:15px}
.auth .gbtn{margin-top:16px!important}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12.5px;margin:14px 0 0}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.err{color:var(--fail);font-size:13.5px;min-height:0;margin:8px 0 0}
.err:empty{display:none}
.note{color:var(--muted);font-size:13.5px;margin:10px 0 0}
.gnote{font-size:12.5px;margin:6px 0 0}
.note a{color:var(--ink)}
.done{color:var(--ink);font-size:15.5px;line-height:1.5;margin-top:18px}

/* Motion: the recorder window is the only thing that moves on its own. */
@media (prefers-reduced-motion:reduce){:root{scroll-behavior:auto}*{transition:none!important;animation:none!important}}

@media (max-width:1020px){.foot-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.foot-brand{grid-column:1/-1}.specs{grid-template-columns:repeat(2,minmax(0,1fr))}.feats{--cols:2!important}}
@media (max-width:900px){.auth-card{order:-1}.auth-ex,.auth-files{display:none!important}.win-body{grid-template-columns:1fr}.screen{border-right:0;border-bottom:1px solid var(--line)}.transcript ol{max-height:280px}.split,.faq-grid,.article,.auth-shell{grid-template-columns:1fr}.faq-grid>div:first-child,.side{position:static}}
@media (max-width:760px){.nav-main{display:none}.hide-sm{display:none}}
@media (max-width:620px){.compare thead{display:none}.compare tr{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;padding:18px;border-top:1px solid var(--line)}.compare tbody tr:first-child{border-top:0}.compare tbody th,.compare td{padding:0;border:0;width:auto}.compare tbody th{grid-column:1/-1;padding-bottom:4px}.compare td::before{content:attr(data-label);display:block;margin-bottom:4px;font-size:12.5px;font-weight:600;color:var(--muted)}.compare td:nth-child(2)::before{color:var(--signal)}.urlform{flex-direction:column;align-items:stretch;border-radius:22px;padding:8px}.urlform>.ic{display:none}.urlform input{padding:12px 12px}.urlform .pill{width:100%}.specs,.guide-list,.feats{grid-template-columns:1fr!important}.win-bar .win-title{display:none}.faq details p{padding:0 20px 20px}.faq summary{gap:12px;padding:16px}.auth-story,.auth-card{padding:26px 22px}.belt{gap:10px 22px}.belt li{font-size:14px}}`;

export const MARK = `<svg width="28" height="28" viewBox="0 0 26 26" aria-hidden="true"><rect x=".5" y=".5" width="25" height="25" rx="7.5" fill="#874b00"/><path d="M10.2 8.4v9.2l7.2-4.6z" fill="#fff"/><circle cx="20.4" cy="5.6" r="2.6" fill="#c0321c" stroke="#ffffff" stroke-width="1.2"/></svg>`;

/** Drawn icons: one 24px grid, one stroke. */
export const ICONS: Record<string, string> = {
  link: `<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>`,
  play: `<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>`,
  rec: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4" fill="currentColor"/>`,
  captions: `<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.6 10.3a2.2 2.2 0 1 0 0 3.4M16.8 10.3a2.2 2.2 0 1 0 0 3.4"/>`,
  wave: `<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>`,
  lock: `<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  shield: `<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/>`,
  stop: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5h5v5h-5z" fill="currentColor"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>`,
  file: `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>`,
  film: `<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>`,
  list: `<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1.1" fill="currentColor"/><circle cx="4.5" cy="12" r="1.1" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1.1" fill="currentColor"/>`,
  flask: `<path d="M9 3h6M10 3v6L4.6 18.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9V3"/><path d="M7.2 15h9.6"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>`,
  replay: `<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>`,
  mail: `<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>`,
  arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  quote: `<path d="M4 6h16M4 11h16M4 16h10"/>`,
  key: `<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>`,
  server: `<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  laptop: `<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>`,
  user: `<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>`,
};

export function icon(name: string, size = 20): string {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><rect x=".5" y=".5" width="25" height="25" rx="7" fill="#874b00"/><path d="M10.2 8.4v9.2l7.2-4.6z" fill="#fff"/><circle cx="20.4" cy="5.6" r="2.6" fill="#c0321c" stroke="#ffffff" stroke-width="1.2"/></svg>`;

/** The two self-hosted fonts, served at /assets/fonts/<file>. */
const FONT_FILES: Record<string, string> = {
  "fonts/schibsted-grotesk.woff2": "node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2",
  "fonts/jetbrains-mono.woff2": "node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
};

export function fontPath(name: string): string | null {
  const rel = FONT_FILES[name];
  if (!rel) return null;
  const abs = resolve(REPO_ROOT, rel);
  return existsSync(abs) ? abs : null;
}
