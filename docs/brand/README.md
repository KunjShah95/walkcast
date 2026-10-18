# Walkcast brand kit

The mark is the record tile: a Pressed Ochre square with a play glyph, a two-stroke "walk" trail
behind it (the browser moving through the site) and the red record light in the corner. The
wordmark is Schibsted Grotesk 800 at −0.035em tracking, outlined to paths so the SVGs need no font.

| File | Use |
| --- | --- |
| `svg/walkcast-mark.svg` | The mark, full colour. Favicon, avatars, app icon source. |
| `svg/walkcast-logo.svg` | Horizontal lockup on light backgrounds. |
| `svg/walkcast-logo-white.svg` | Horizontal lockup on ink / dark backgrounds. |
| `svg/walkcast-logo-stacked.svg` | Stacked lockup for square spaces. |
| `svg/walkcast-wordmark.svg` | Wordmark alone. |
| `svg/walkcast-mark-mono-ink.svg`, `svg/walkcast-mark-mono-white.svg` | One-colour mark (print, embossing, overlays). |
| `svg/walkcast-app-icon.svg` | 1024 app icon with a safe-area margin (store listings). |
| `png/*` | Raster exports: mark and app icon at 1024, lockups at 256 px tall, OG image at 1200×630. |

The OG image is also published at `apps/web/public/assets/og.png`, and the same mark is drawn
inline in `packages/brand/src/index.ts` (`MARK`, `FAVICON`), `apps/web/src/ui.tsx`,
`apps/desktop/dashboard/src/App.tsx`, `apps/desktop/splash/index.html` and
`apps/web/public/favicon.svg`. The Tauri icons in `apps/desktop/src-tauri/icons/` are exported
from `png/walkcast-mark-1024.png`.

## Rules

- Clear space around the mark: a quarter of its width on every side.
- Minimum size: 16 px for the mark, 96 px wide for the horizontal lockup.
- Colours: tile `#874b00` (gradient `#9c5700 → #7a4100` at large sizes), record light `#c0321c`,
  glyph `#ffffff`, wordmark Ink `#1b1a17`. These are the tokens in `DESIGN.md`.
- Don't recolour the record light, rotate the mark, or set the wordmark in another typeface.

## Regenerating

```sh
python3 -m venv .venv && .venv/bin/pip install fonttools brotli
.venv/bin/python docs/brand/wordmark.py docs/launch/source/fonts/schibsted-grotesk.woff2 Walkcast 800 > docs/brand/wordmark-path.json
python3 docs/brand/build.py   # writes docs/brand/out/*.svg
```
