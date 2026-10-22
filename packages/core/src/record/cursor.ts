import type { Page } from "playwright";

/**
 * A pointer the viewer can follow.
 *
 * Playwright's video has no mouse in it: a click happens and the page changes, with nothing on
 * screen to say where. A screen recorder shows the real cursor; this draws one. Before each
 * click or fill the pointer glides to the control and a ring settles around it, so the video
 * shows what was used, not only what happened next.
 *
 * The overlay is drawn in the page itself (an init script), because that is the only layer the
 * recording sees. It takes no pointer events, uses no innerHTML (sites with Trusted Types
 * refuse it) and remembers where it was across navigations, so the pointer never jumps back to
 * a corner on every new page.
 */

/** Where a control was on screen, in CSS pixels of the 1920×1080 viewport. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How long the pointer takes to reach a control. Long enough to follow, short enough not to drag. */
export const GLIDE_MS = 520;

/** Runs in every page before the site's own scripts. Must be self-contained. */
export const CURSOR_SCRIPT = `(() => {
  if (window.__wcCursor) return;
  const KEY = "__wc_cursor";
  const NS = "http://www.w3.org/2000/svg";
  let layer, pointer, ring, x = 960, y = 540;
  try { const saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (saved) { x = saved.x; y = saved.y; } } catch {}
  const mount = () => {
    if (layer && layer.isConnected) return true;
    const root = document.body || document.documentElement;
    if (!root) return false;
    layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("data-walkcast", "cursor");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden;contain:strict";
    ring = document.createElement("div");
    ring.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;border-radius:10px;opacity:0;box-shadow:0 0 0 3px rgba(29,94,88,.95),0 0 0 9px rgba(246,215,118,.45);transition:opacity .25s,transform .25s;transform:scale(1.08)";
    pointer = document.createElementNS(NS, "svg");
    pointer.setAttribute("width", "30");
    pointer.setAttribute("height", "30");
    pointer.setAttribute("viewBox", "0 0 24 24");
    pointer.style.cssText = "position:absolute;left:0;top:0;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));will-change:transform";
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M4 2.5 19 12l-6.6 1.5L9 19.8z");
    path.setAttribute("fill", "#141311");
    path.setAttribute("stroke", "#fff");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linejoin", "round");
    pointer.appendChild(path);
    layer.appendChild(ring);
    layer.appendChild(pointer);
    root.appendChild(layer);
    place(x, y);
    return true;
  };
  const place = (px, py) => {
    x = px; y = py;
    if (pointer) pointer.style.transform = "translate(" + (px - 4) + "px," + (py - 3) + "px)";
    try { sessionStorage.setItem(KEY, JSON.stringify({ x: px, y: py })); } catch {}
  };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  window.__wcCursor = {
    glide(tx, ty, ms) {
      if (!mount()) return Promise.resolve();
      const fx = x, fy = y, t0 = performance.now();
      return new Promise((done) => {
        // A hidden or throttled page may never run another animation frame: a timer finishes
        // the glide regardless, so the pointer can never hold the recording up.
        let finished = false;
        const finish = () => { if (finished) return; finished = true; place(tx, ty); done(); };
        const fallback = setTimeout(finish, ms + 150);
        const step = (now) => {
          if (finished) return;
          const p = Math.min(1, (now - t0) / ms), k = ease(p);
          place(fx + (tx - fx) * k, fy + (ty - fy) * k);
          if (p < 1) requestAnimationFrame(step); else { clearTimeout(fallback); finish(); }
        };
        requestAnimationFrame(step);
      });
    },
    ring(bx, by, bw, bh) {
      if (!mount()) return;
      const pad = 6;
      ring.style.left = (bx - pad) + "px"; ring.style.top = (by - pad) + "px";
      ring.style.width = (bw + pad * 2) + "px"; ring.style.height = (bh + pad * 2) + "px";
      ring.style.opacity = "1"; ring.style.transform = "scale(1)";
    },
    press() {
      if (!mount()) return;
      pointer.animate([{ scale: 1 }, { scale: 0.82 }, { scale: 1 }], { duration: 220, easing: "ease-out" });
    },
    clear() { if (ring) { ring.style.opacity = "0"; ring.style.transform = "scale(1.08)"; } },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();`;

/**
 * Bring a control into view, glide the pointer to it and ring it.
 *
 * Returns where the control sits on screen, or null when it is not there to point at; the
 * caller still does the action, so a pointer that cannot find its target never stops a run.
 */
export async function pointAt(page: Page, selector: string): Promise<Box | null> {
  const box = await page
    .$eval(selector, (el) => {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" as ScrollBehavior });
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })
    .catch(() => null);
  if (!box || box.w <= 0 || box.h <= 0) return null;
  const tx = box.x + Math.min(box.w / 2, 24);
  const ty = box.y + box.h / 2;
  // Raced against a timer too: a page that stops answering must not stop the recording.
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    page
      .evaluate(
        ([cx, cy, ms]) => (window as unknown as { __wcCursor?: { glide: (x: number, y: number, ms: number) => Promise<void> } }).__wcCursor?.glide(cx!, cy!, ms!),
        [tx, ty, GLIDE_MS],
      )
      .catch(() => undefined),
    new Promise<void>((resolve) => (timer = setTimeout(resolve, GLIDE_MS + 1000))),
  ]);
  clearTimeout(timer);
  await page
    .evaluate(
      ([bx, by, bw, bh]) => (window as unknown as { __wcCursor?: { ring: (...a: number[]) => void } }).__wcCursor?.ring(bx!, by!, bw!, bh!),
      [box.x, box.y, box.w, box.h],
    )
    .catch(() => undefined);
  // The ring fades in over 0.25 s; a picture taken before then shows no ring.
  await page.waitForTimeout(280);
  return box;
}

/** The pointer presses down: a short squeeze, drawn as the click happens. */
export async function press(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __wcCursor?: { press: () => void } }).__wcCursor?.press()).catch(() => undefined);
}

/** Take the ring away once the action is done. */
export async function clearRing(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __wcCursor?: { clear: () => void } }).__wcCursor?.clear()).catch(() => undefined);
}
