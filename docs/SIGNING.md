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