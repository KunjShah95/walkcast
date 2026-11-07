/**
 * Latest release with published installer assets. Advance only after the GitHub release is live.
 */
export const VERSION = "0.10.10";
export const REPO_URL = "https://github.com/KunjShah95/walkcast";
export const RELEASES_URL = `${REPO_URL}/releases`;
const releaseAsset = (version: string, file: string) => `${RELEASES_URL}/download/v${version}/${file}`;
export const WINDOWS_EXE_URL = releaseAsset(VERSION, `walkcast_${VERSION}_x64-setup.exe`);
export const WINDOWS_MSI_URL = releaseAsset(VERSION, `walkcast_${VERSION}_x64_en-US.msi`);
// macOS is no longer supported.
export const LINUX_APPIMAGE_URL = releaseAsset(VERSION, `walkcast_${VERSION}_amd64.AppImage`);
export const LINUX_DEB_URL = releaseAsset(VERSION, `walkcast_${VERSION}_amd64.deb`);
/** Published installers retained on the download page after a newer version is released. */
export const PREVIOUS_RELEASES = ["0.10.9", "0.10.8", "0.10.7", "0.10.6", "0.10.5", "0.10.4", "0.10.3", "0.10.2", "0.9.1", "0.9.0", "0.8.1", "0.6.0"].map((version) => ({
  version,
  releaseUrl: `${RELEASES_URL}/tag/v${version}`,
  windowsExe: releaseAsset(version, `walkcast_${version}_x64-setup.exe`),
  windowsMsi: releaseAsset(version, `walkcast_${version}_x64_en-US.msi`),
  linuxAppImage: releaseAsset(version, `walkcast_${version}_amd64.AppImage`),
  linuxDeb: releaseAsset(version, `walkcast_${version}_amd64.deb`),
}));
export const ISSUES_URL = `${REPO_URL}/issues`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
/** The Walkcast Lab chapter of the README: browser-agent regression testing. */
export const LAB_URL = `${REPO_URL}#walkcast-lab`;
