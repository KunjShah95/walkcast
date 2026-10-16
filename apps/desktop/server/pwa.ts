/** Tiny PWA support: manifest + a service worker so the web app can be installed. */

export interface ManifestOptions {
  siteUrl: string;
}

export function webManifest({ siteUrl }: ManifestOptions): string {
  return JSON.stringify(
    {
      name: "Walkcast",
      short_name: "Walkcast",
      description: "Record narrated video walkthroughs of sites you own or may test, or turn a failed browser-agent run into a reproducible regression test.",
      start_url: `${siteUrl}/app`,
      scope: "/",
      display: "standalone",
      orientation: "any",
      background_color: "#0a0b0d",
      theme_color: "#0a0b0d",
      icons: [
        {
          src: "/favicon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    },
    null,
    2,
  );
}

/** A minimal service worker: enough to make the app installable and keep it offline-capable for the shell. */
export const SERVICE_WORKER = `self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  // Never cache API or auth responses.
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth") || url.pathname.startsWith("/files")) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response && response.status === 200 && response.type === "basic") {
        const copy = response.clone();
        caches.open("walkcast-shell-v1").then((cache) => cache.put(request, copy)).catch(() => undefined);
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("/app")))
  );
});
`;
