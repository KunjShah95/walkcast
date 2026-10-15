import { chromium } from "playwright";
const b = await chromium.launch();
const base = "http://127.0.0.1:4778/app";
const idx = await (await fetch("http://127.0.0.1:4778/api/index")).json();
console.log("runs", idx.runs.length, "fixtures", idx.fixtures.length, "exp", idx.experiments.length, "rec", idx.recordings.length);
const r0 = idx.runs[0].dir, r1 = idx.runs[1].dir;
const routes = ["", "#simulator", "#record", "#runs", "#fixtures", "#experiments", `#run/${encodeURIComponent(r0)}`, `#compare/${encodeURIComponent(r0)}|${encodeURIComponent(r1)}`, "#run/nope", "#record?url=https%3A%2F%2Fx.com"];
for (const vp of [{ width: 1280, height: 900 }, { width: 375, height: 800 }]) {
  const p = await b.newPage({ viewport: vp });
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error" || m.type()==="warning") errs.push(m.type()+": "+m.text().slice(0, 200)); });
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  for (const r of routes) {
    errs.length = 0;
    await p.goto(base + r); await p.waitForTimeout(1200);
    const ov = await p.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll("body *")].filter((e) => { const rc = e.getBoundingClientRect(); return rc.right > w + 1 && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map((e) => e.tagName + "." + (e.className?.baseVal ?? e.className).toString().slice(0, 60));
      return { sw: document.documentElement.scrollWidth, w, wide, h1: document.querySelector("h1")?.textContent?.slice(0, 80) };
    });
    console.log(vp.width, r.slice(0, 40), JSON.stringify(ov), errs.join(" | "));
  }
  await p.close();
}
// simulator interaction
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type()==="error" && errs.push(m.text()));
await p.goto(base + "#simulator"); await p.waitForTimeout(1000);
console.log("sim text:", (await p.locator("main").innerText()).slice(0, 1500));
await p.getByRole("button", { name: "Play" }).click(); await p.waitForTimeout(1500);
console.log("packets", await p.locator("circle.packet").count());
await p.getByRole("button", { name: "Skip to the result" }).click(); await p.waitForTimeout(300);
console.log("score:", (await p.locator("text=Reliability scorecard").locator("..").locator("..").locator("..").innerText()).slice(0, 400));
// click run scenario signed out
const runBtn = p.getByRole("button", { name: /Run again|Run this scenario/ });
if (await runBtn.count()) { await runBtn.click(); await p.waitForTimeout(1500); console.log("after run click:", await p.locator("p.text-fail").allInnerTexts()); }
// third fault
for (const id of ["fault-stale-owners", "fault-ui-drift"]) await p.locator("#" + id).check().catch(e=>console.log("chk", e.message.slice(0,80)));
console.log("checked:", await p.locator("input[type=checkbox]:checked").evaluateAll((els) => els.map((e) => e.id)));
// back button
await p.goto(base + "#runs"); await p.getByRole("button", { name: "Fixtures" }).click(); await p.waitForTimeout(300);
await p.goBack(); await p.waitForTimeout(500); console.log("after back h1:", await p.locator("h1").first().innerText(), p.url());
console.log("errs", errs);
await b.close();
