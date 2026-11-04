import { useEffect, useState } from "react";

/**
 * Theme: follows the OS (`prefers-color-scheme`) unless the person picked Light or Dark in
 * Settings. The resolved theme is written to `<html data-theme>`, which is all the CSS reads.
 * When the system preference can't be read, the answer is light.
 */
export type ThemePref = "system" | "light" | "dark";

const KEY = "lab-theme";
const EVENT = "walkcast:theme";

export function readThemePref(): ThemePref {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function systemDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  return pref === "system" ? (systemDark() ? "dark" : "light") : pref;
}

function apply(pref: ThemePref) {
  document.documentElement.setAttribute("data-theme", resolveTheme(pref));
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable: still applies for this session */
  }
  apply(pref);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pref }));
}

let current: ThemePref = "system";

/** Call once before first render: applies the theme and keeps "system" in step with the OS. */
export function initTheme() {
  current = readThemePref();
  apply(current);
  window.addEventListener(EVENT, (e) => {
    current = (e as CustomEvent<ThemePref>).detail;
  });
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (current === "system") apply("system");
    });
  } catch {
    /* old webview without matchMedia listeners: the theme updates on next launch */
  }
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  useEffect(() => {
    const on = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [pref, setThemePref];
}
