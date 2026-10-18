# Releases are unsigned (by design)

Walkcast installers are **not code-signed**. This is a deliberate choice: signing costs
money (~$99/yr Apple + $200-500/yr Windows cert) and is skipped.

## What users see
- **Windows**: "Windows protected your PC" — click **More info → Run anyway**.
- **macOS**: blocked Gatekeeper — right-click the app → **Open**, or:

  ```sh
  xattr -d com.apple.quarantine /Applications/walkcast.app
  ```

- **Linux (.deb / .AppImage)**: no warning.

## Building
`npx tauri build` produces unsigned installers. The release workflow
(`.github/workflows/release.yml`) builds and publishes them as-is, with no certificates.

## If signing is ever needed
Add a `bundle.windows.certificateThumbprint` (OV/EV cert) and Apple Developer
credentials, then wire them into the release workflow. Until then, leave it unsigned.
## In-app updates use a different, free key

The desktop app updates itself (Settings → Updates) with Tauri's updater. That needs no paid
certificate: every update is signed with a free minisign key pair, and the app refuses any
download whose signature doesn't match the public key built into it (`plugins.updater.pubkey` in
`apps/desktop/src-tauri/tauri.conf.json`).

- The private key and its password live in the repository secrets `TAURI_SIGNING_PRIVATE_KEY`
  and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; the release workflow signs with them and publishes
  `latest.json`, the feed the app polls.
- The maintainer's copy is in `~/.tauri/walkcast-updater.key` (+ `.password`). **Back it up.**
  If it is lost, installed apps can never verify another update, and everyone has to reinstall
  a build carrying a new public key by hand.
- Updates reach apps from v0.3.1 on (the first build with the updater). Older installs update
  once, manually, from the releases page.
