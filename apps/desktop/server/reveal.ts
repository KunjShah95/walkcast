import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { dirname } from "node:path";
import { log } from "../../../packages/core/src/ops/log.ts";

/**
 * Show a file in the OS file manager, selected. Arguments go straight to the program (execFile,
 * no shell), so a file name can never become a command. Windows' explorer exits 1 even when it
 * worked, so its exit code is not an error worth reporting.
 */
export function revealInFileManager(path: string): void {
  const done = (error: Error | null) => {
    if (error && process.platform !== "win32") log.warn("reveal.failed", { error: error.message });
  };
  if (process.platform === "win32") execFile("explorer.exe", [`/select,${path}`], { windowsHide: false }, done);
  else if (process.platform === "darwin") execFile("open", ["-R", path], done);
  else execFile("xdg-open", [isDir(path) ? path : dirname(path)], done);
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
