import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { type PageState, type Recorder, type TargetCheck, redact } from "./recorder.ts";

/** One interactive element as an agent sees it. Compact on purpose: no raw DOM. */
export interface ObservedElement {
  index: number;
  tag: string;
  role: string;
  name: string;
  selector: string;
  type?: string;
  value?: string;
  options?: { index: number; label: string; value: string }[];
}

export interface Observation {
  stepId: number;
  at: number;
  url: string;
  title: string;
  fingerprint: string;
  elements: ObservedElement[];
  text: string;
}

/**
 * The only way an agent may touch the browser. Each call is one recorded step with page
 * state before and after, so failures can be localized to the action that caused them.
 */
export class BrowserTools {
  private observations = new Map<number, Observation>();
  private lastObservation: Observation | undefined;

  constructor(
    readonly page: Page,
    readonly recorder: Recorder,
    readonly baseUrl: string,
  ) {}

  async goto(path: string): Promise<PageState | null> {
    return this.record("goto", { path }, async () => {
      await this.page.goto(new URL(path, this.baseUrl).toString(), { waitUntil: "load" });
      return this.state();
    });
  }

  async observe(): Promise<Observation> {
    return this.record("observe", {}, async (stepId) => {
      const snapshot = await this.page.evaluate(observeInPage);
      const observation: Observation = {
        stepId,
        at: this.recorder.now(),
        url: this.page.url(),
        title: await this.page.title(),
        fingerprint: fingerprint(this.page.url(), snapshot.elements),
        elements: snapshot.elements,
        text: snapshot.text,
      };
      this.observations.set(stepId, observation);
      this.lastObservation = observation;
      return observation;
    }, (o) => ({
      elements: o.elements.length,
      fingerprint: o.fingerprint,
      // Compact control inventory (no values) so runs can be diffed against a baseline.
      controls: o.elements.map((e) => ({ role: e.role, name: e.name, selector: e.selector })),
    }));
  }

  /**
   * Wait until no requests are in flight and the URL has not changed for `quietMs`. Unlike
   * "networkidle", this also covers a navigation that a click has scheduled but not yet started.
   */
  async waitForQuiet(quietMs = 300, timeoutMs = 8000): Promise<{ quiet: boolean; waitedMs: number }> {
    let pending = 0;
    const onRequest = () => pending++;
    const onDone = () => (pending = Math.max(0, pending - 1));
    this.page.on("request", onRequest);
    this.page.on("requestfinished", onDone);
    this.page.on("requestfailed", onDone);
    const start = Date.now();
    try {
      let url = this.page.url();
      let quietSince = Date.now();
      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 50));
        if (pending > 0 || this.page.url() !== url) {
          url = this.page.url();
          quietSince = Date.now();
        } else if (Date.now() - quietSince >= quietMs) {
          await this.page.waitForLoadState("load", { timeout: Math.max(1, timeoutMs - (Date.now() - start)) }).catch(() => undefined);
          return { quiet: true, waitedMs: Date.now() - start };
        }
      }
      return { quiet: false, waitedMs: Date.now() - start };
    } finally {
      this.page.off("request", onRequest);
      this.page.off("requestfinished", onDone);
      this.page.off("requestfailed", onDone);
    }
  }

  /** Wait until the interactive DOM stops changing for `quietMs` (or `timeoutMs` passes). */
  async waitForSettle(quietMs: number, timeoutMs: number): Promise<{ settled: boolean; waitedMs: number }> {
    return this.record("waitForSettle", { quietMs, timeoutMs }, async () => {
      const start = Date.now();
      let last = await this.currentFingerprint();
      let lastChange = Date.now();
      while (Date.now() - start < timeoutMs) {
        await this.page.waitForTimeout(100);
        const fp = await this.currentFingerprint();
        if (fp !== last) {
          last = fp;
          lastChange = Date.now();
        } else if (Date.now() - lastChange >= quietMs) {
          return { settled: true, waitedMs: Date.now() - start };
        }
      }
      return { settled: false, waitedMs: Date.now() - start };
    });
  }

  async fill(index: number, value: string, from?: Observation): Promise<void> {
    const element = this.element(index, from);
    await this.record("fill", { index, name: element.name, value }, async () => {
      await this.page.fill(element.selector, value, { timeout: 2000 });
    }, undefined, () => this.checkTarget(element, from));
  }

  async click(index: number, from?: Observation): Promise<void> {
    const element = this.element(index, from);
    await this.record("click", { index, name: element.name }, async () => {
      await this.page.click(element.selector, { timeout: 2000, noWaitAfter: true });
    }, undefined, () => this.checkTarget(element, from));
  }

  /** Click a CSS selector directly (e.g. one cached from an earlier run). */
  async clickSelector(selector: string, timeoutMs = 2000): Promise<void> {
    await this.record("clickSelector", { selector }, async () => {
      await this.page.click(selector, { timeout: timeoutMs, noWaitAfter: true });
    });
  }

  /** Select by option position as observed earlier (how index-based agents address options). */
  async selectOptionAt(index: number, optionIndex: number, from?: Observation): Promise<string> {
    const element = this.element(index, from);
    const observedLabel = element.options?.[optionIndex]?.label ?? "";
    return this.record(
      "selectOptionAt",
      { index, optionIndex, observedLabel },
      async () => {
        const selected = await this.page.$eval(
          element.selector,
          (el, i) => {
            const select = el as HTMLSelectElement;
            select.selectedIndex = i;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            return select.options[i]?.label ?? "";
          },
          optionIndex,
        );
        return selected;
      },
      undefined,
      () => this.checkOptionTarget(element, optionIndex, observedLabel, from),
    );
  }

  async selectByLabel(index: number, label: string, from?: Observation): Promise<string> {
    const element = this.element(index, from);
    return this.record("selectByLabel", { index, label }, async () => {
      await this.page.selectOption(element.selector, { label }, { timeout: 2000 });
      return label;
    });
  }

  async readValue(selector: string): Promise<string | null> {
    return this.record("readValue", { selector }, async () =>
      this.page.$eval(selector, (el) => {
        if (el instanceof HTMLSelectElement) return el.options[el.selectedIndex]?.label ?? "";
        if (el instanceof HTMLInputElement) return el.value;
        return el.textContent?.trim() ?? "";
      }).catch(() => null),
    );
  }

  /** Wait for the URL to change after an action that should navigate. Throws on timeout. */
  async waitForNavigation(fromUrl: string, timeoutMs: number): Promise<string> {
    return this.record("waitForNavigation", { timeoutMs }, async () => {
      await this.page.waitForURL((u) => u.toString() !== fromUrl, { timeout: timeoutMs, waitUntil: "load" });
      return this.page.url();
    });
  }

  /** Read a page with the session's cookies without navigating the tab (used for read-back checks). */
  async fetchText(path: string): Promise<string> {
    return this.record("fetchText", { path }, async () => {
      const res = await this.page.request.get(new URL(path, this.baseUrl).toString());
      return res.text();
    }, (text) => ({ length: text.length }));
  }

  async done(success: boolean, summary: string, leadId?: number): Promise<void> {
    const stepId = ++this.recorder.currentStep;
    this.recorder.push({ type: "claim", stepId, at: this.recorder.now(), success, summary, leadId });
  }

  // ------------------------------------------------------------ internals

  private element(index: number, from?: Observation): ObservedElement {
    const observation = from ?? this.lastObservation;
    const element = observation?.elements.find((e) => e.index === index);
    if (!element) throw new Error(`No element ${index} in observation ${observation?.stepId ?? "(none)"}`);
    return element;
  }

  private async checkTarget(element: ObservedElement, from?: Observation): Promise<TargetCheck> {
    const observation = (from ?? this.lastObservation)!;
    const nameAtAction = await this.page
      .$eval(element.selector, (el) => (window as unknown as { __labName: (e: Element) => string }).__labName?.(el) ?? null)
      .catch(() => null);
    const fp = await this.currentFingerprint();
    return {
      observedInStep: observation.stepId,
      observedName: element.name,
      nameAtAction,
      stale: nameAtAction !== null && nameAtAction !== element.name,
      observationAgeMs: this.recorder.now() - observation.at,
      fingerprintChanged: fp !== observation.fingerprint,
    };
  }

  private async checkOptionTarget(
    element: ObservedElement,
    optionIndex: number,
    observedLabel: string,
    from?: Observation,
  ): Promise<TargetCheck> {
    const observation = (from ?? this.lastObservation)!;
    const labelAtAction = await this.page
      .$eval(element.selector, (el, i) => (el as HTMLSelectElement).options[i]?.label ?? null, optionIndex)
      .catch(() => null);
    const fp = await this.currentFingerprint();
    return {
      observedInStep: observation.stepId,
      observedName: observedLabel,
      nameAtAction: labelAtAction,
      stale: labelAtAction !== observedLabel,
      observationAgeMs: this.recorder.now() - observation.at,
      fingerprintChanged: fp !== observation.fingerprint,
    };
  }

  private async currentFingerprint(): Promise<string> {
    const snapshot = await this.page.evaluate(observeInPage).catch(() => ({ elements: [] as ObservedElement[], text: "" }));
    return fingerprint(this.page.url(), snapshot.elements);
  }

  /**
   * Snapshot for the trace. Bounded so that capture never changes the agent's timing: while a
   * navigation is pending, page.title()/evaluate() block until it commits, which would hide
   * exactly the timing failures we want to record.
   */
  private async state(): Promise<PageState | null> {
    const url = this.page.url();
    const snapshot = Promise.all([this.page.title(), this.currentFingerprint()]).then(
      ([title, fp]) => ({ url, title, fingerprint: fp }),
      () => null,
    );
    const pending = new Promise<PageState>((resolve) =>
      setTimeout(() => resolve({ url, title: "(navigation pending)", fingerprint: "pending" }), 250),
    );
    return Promise.race([snapshot, pending]);
  }

  /** Wrap any browser-affecting operation as one recorded step (state before/after, network, errors). */
  async record<T>(
    tool: string,
    args: Record<string, unknown>,
    run: (stepId: number) => Promise<T>,
    summarize?: (value: T) => unknown,
    preCheck?: () => Promise<TargetCheck>,
  ): Promise<T> {
    const stepId = ++this.recorder.currentStep;
    const startedAt = this.recorder.now();
    const before = await this.state();
    const target = preCheck ? await preCheck().catch(() => undefined) : undefined;
    let result: T | undefined;
    let error: string | undefined;
    try {
      result = await run(stepId);
      return result;
    } catch (e) {
      error = e instanceof Error ? e.message.split("\n")[0] : String(e);
      throw e;
    } finally {
      const after = await this.state();
      let screenshot: string | undefined;
      if (this.recorder.options.screenshots) {
        screenshot = this.recorder.screenshotPath(stepId);
        await this.page.screenshot({ path: screenshot, type: "jpeg", quality: 50 }).catch(() => (screenshot = undefined));
      }
      this.recorder.push({
        type: "step",
        stepId,
        tool,
        args: redact(args),
        startedAt,
        endedAt: this.recorder.now(),
        before,
        after,
        ...(target ? { target } : {}),
        ...(result !== undefined ? { result: summarize ? summarize(result) : result } : {}),
        ...(error ? { error } : {}),
        ...(screenshot ? { screenshot } : {}),
      });
    }
  }
}

function fingerprint(url: string, elements: ObservedElement[]): string {
  const shape = elements.map((e) => [e.tag, e.role, e.name, e.options?.map((o) => o.label)]);
  return createHash("sha1").update(new URL(url).pathname + JSON.stringify(shape)).digest("hex").slice(0, 12);
}

/** Runs inside the page. Must be self-contained. */
function observeInPage(): { elements: ObservedElement[]; text: string } {
  const nameOf = (el: Element): string => {
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      return (label?.textContent ?? el.getAttribute("aria-label") ?? el.name ?? "").trim();
    }
    return (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ");
  };
  (window as unknown as { __labName: (e: Element) => string }).__labName = nameOf;
  const roleOf = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    const type = (el as HTMLInputElement).type;
    if (type === "checkbox") return "checkbox";
    if (type === "submit") return "button";
    return "textbox";
  };
  const selectorOf = (el: Element): string => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body) {
      const parent: Element | null = node.parentElement;
      const tag = node.tagName.toLowerCase();
      const siblings = parent ? Array.from(parent.children).filter((c) => c.tagName === node!.tagName) : [];
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
      node = parent;
    }
    return `body > ${parts.join(" > ")}`;
  };
  const visible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const nodes = Array.from(
    document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea"),
  ).filter(visible);
  const elements = nodes.map((el, index) => {
    const base = {
      index,
      tag: el.tagName.toLowerCase(),
      role: roleOf(el),
      name: nameOf(el),
      selector: selectorOf(el),
    } as ObservedElement;
    if (el instanceof HTMLInputElement) {
      base.type = el.type;
      if (el.type !== "password") base.value = el.value;
    }
    if (el instanceof HTMLButtonElement) base.type = el.type;
    if (el instanceof HTMLSelectElement) {
      base.options = Array.from(el.options).map((o, i) => ({ index: i, label: o.label, value: o.value }));
      base.value = el.options[el.selectedIndex]?.label ?? "";
    }
    return base;
  });
  return { elements, text: (document.body?.innerText ?? "").slice(0, 1500) };
}
