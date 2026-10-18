# Walkcast mobile companion

A native shell (Capacitor 8) around a Walkcast server's mobile view. Enter your server's address
once, and the app opens `/app#mobile` on it: recent recordings, playback, and starting a lab run.
Sign-in, recordings and runs all live on the server; the app stores only the list of servers you
connected to.

Status: the Android and iOS projects are generated and committed, but **neither has been built or
run on a device yet**. The machine they were made on has no Android SDK or Xcode.

## Build

```sh
cd apps/mobile
npm install
npm run android   # needs Android Studio (it bundles the SDK and JDK); opens the project, then Run
npm run ios       # needs macOS + Xcode; run `npx cap sync ios` first so CocoaPods installs
```

After editing `www/`, run `npx cap sync` to copy it into both native projects.

## Server requirements

- Reachable over HTTPS from the phone (`LAB_SITE_URL` set to that origin).
- `/healthz` answers cross-origin (it does, from v0.2.1+), so the connect screen can check an
  address before opening it.
- Desktop-only servers bound to `127.0.0.1` can't be reached from a phone; use a deployed server
  (docs/DEPLOY-AWS.md) or bind the desktop server to your LAN with sign-in on (`LAB_HOST`,
  `LAB_AUTH=on`).
