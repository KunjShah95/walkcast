/**
 * What people have said about Walkcast in public, quoted word for word.
 *
 * Rules for an entry: the quote is copied exactly as posted (trim, never reword); `url` is the
 * post itself; `highlight` is a phrase that appears verbatim inside `quote`. Nothing here is
 * written by us. The section stays hidden until there are three entries.
 *
 * `avatar` is optional: a file under apps/web/public (e.g. "/voices/handle.jpg"), saved with the
 * author's permission. Without one the card shows the author's initials.
 */
export type Voice = {
  quote: string;
  highlight?: string;
  name: string;
  handle: string;
  role?: string;
  avatar?: string;
  /** The author's profile. Defaults to x.com/<handle> or github.com/<handle> by source. */
  profile?: string;
  source: { kind: "x" | "github" | "hn" | "reddit"; url: string; date: string };
};

export const VOICES: Voice[] = [
  // {
  //   quote: "…the tweet, exactly as posted…",
  //   highlight: "a phrase from the tweet",
  //   name: "Display Name",
  //   handle: "handle",
  //   role: "Founder, Example",
  //   source: { kind: "x", url: "https://x.com/handle/status/1234567890", date: "2026-10-01" },
  // },
];

/**
 * Layout fixtures, shown only at /?voices=preview so the section can be checked before real posts
 * exist. They say they are placeholders, on purpose.
 */
export const VOICE_PLACEHOLDERS: Voice[] = [
  {
    quote: "Placeholder. A real post goes here, copied word for word, with the phrase that matters picked out.",
    highlight: "copied word for word",
    name: "Placeholder One",
    handle: "placeholder",
    role: "Layout check",
    source: { kind: "x", url: "https://x.com", date: "2026-10-01" },
  },
  {
    quote: "Placeholder. A longer post to check wrapping: two or three sentences, the way people actually write when something saved them an afternoon of screen recording.",
    highlight: "saved them an afternoon",
    name: "Placeholder Two",
    handle: "placeholder2",
    source: { kind: "x", url: "https://x.com", date: "2026-09-18" },
  },
  {
    quote: "Placeholder. A short one.",
    name: "Placeholder Three",
    handle: "placeholder3",
    role: "Layout check",
    source: { kind: "github", url: "https://github.com", date: "2026-08-30" },
  },
  {
    quote: "Placeholder. A fourth post, so the fan of cards has depth behind the one in front.",
    highlight: "depth behind the one in front",
    name: "Placeholder Four",
    handle: "placeholder4",
    source: { kind: "hn", url: "https://news.ycombinator.com", date: "2026-08-12" },
  },
];
