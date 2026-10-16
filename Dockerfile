# Walkcast: one image, two roles.
#   web:    npm run lab -- ui        (LAB_WORKER=off when separate workers run)
#   worker: npm run lab -- worker
# The Playwright base matches package.json (playwright 1.56.1) and ships Chromium's system deps.
FROM mcr.microsoft.com/playwright:v1.56.1-noble

# Ubuntu's ffmpeg includes libx264 and the flite voice used for narration.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && ffmpeg -hide_banner -filters | grep -q flite

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    LAB_HOST=0.0.0.0 \
    PORT=4320 \
    LAB_LOG=json

WORKDIR /app
COPY package.json package-lock.json ./
# tsx runs the TypeScript sources directly, so dev dependencies stay in the image (NODE_ENV=production
# above would make npm ci skip them without --include=dev).
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run ui:build \
 && mkdir -p runs recordings .lab \
 && chown -R pwuser:pwuser runs recordings .lab

# Never run the browser as root.
USER pwuser
EXPOSE 4320
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4320)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# node receives SIGTERM directly (no npm wrapper), so shutdown is graceful. Run with an init
# process (docker --init, ECS initProcessEnabled) so Chromium's child processes are reaped.
CMD ["node", "--import", "tsx", "apps/desktop/cli.ts", "ui"]
