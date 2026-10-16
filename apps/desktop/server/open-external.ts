import { spawn } from "node:child_process";

/** Open a URL in the system's default browser (the desktop app's server runs on the user's machine). */
export function openExternal(url: string): void {
  if (!/^https?:\/\//.test(url)) throw new Error(`refusing to open a non-web URL: ${url}`);
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
}
