import tauri from "../../desktop/src-tauri/tauri.conf.json";

/**
 * Where the desktop installers live. The version comes from the Tauri config, the one place it is
 * set, so the file names below always match what the release workflow publishes.
 */
export const VERSION: string = tauri.version;
export const REPO_URL = "https://github.com/KunjShah95/browser-user";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const WINDOWS_EXE_URL = `${RELEASES_URL}/latest/download/walkcast_${VERSION}_x64-setup.exe`;
export const WINDOWS_MSI_URL = `${RELEASES_URL}/latest/download/walkcast_${VERSION}_x64_en-US.msi`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
