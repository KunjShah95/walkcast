import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { serveDashboard } from "../apps/desktop/server/server.ts";

/**
 * Notes pinned to a moment in a walkthrough.
 *
 * The walkthrough is the evidence; the note is its owner's reading of it. The rules: a note
 * belongs to the walkthrough's owner and to nobody else, it carries a place in the video, and
 * it only reaches a share link when the owner says that link should carry it.
 */

const roots: string[] = [];
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** A walkthrough on disk, as the recorder would have left it. */
function aRecording(root: string): string {
  const id = "shop.example-abc123";
  const dir = join(root, "recordings", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "recording.json"),
    JSON.stringify({
      id,
      dir: `recordings/${id}`,
      url: "https://shop.example/",
      createdAt: "2026-10-20T10:00:00.000Z",
      durationMs: 4200,
      signIn: { attempted: false, outcome: "not-attempted", detail: "" },
      pages: [{ url: "https://shop.example/", title: "Shop", status: 200, controls: 3 }],
      skipped: [],
      captions: [
        { start: 0, end: 2, text: "Opening the shop." },
        { start: 2, end: 4, text: "Here are the products." },
      ],
      media: { video: "video.webm", mp4: "recording.mp4", webm: "narrated.webm", audio: "narration.wav", captions: "captions.vtt", voice: "flite", note: "" },
    }),
  );
  writeFileSync(join(dir, "recording.mp4"), "not really a video");
  writeFileSync(join(dir, "captions.vtt"), "WEBVTT\n");
  return id;
}

async function server(root: string, port: number) {
  return serveDashboard(port, { root, unref: true, requireAuth: false });
}

test("a note is pinned to a moment, listed, and taken back", async () => {
  const root = mkdtempSync(join(tmpdir(), "walkcast-notes-"));
  roots.push(root);
  const id = aRecording(root);
  const srv = await server(root, 7200 + Math.floor(Math.random() * 300));
  try {
    const added = await fetch(`${srv.url}/api/recordings/${id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: 1.5, text: "The search box has no label." }),
    });
    assert.equal(added.status, 201, await added.clone().text());
    const body = (await added.json()) as { annotation: { id: string; at: number; text: string } };
    assert.equal(body.annotation.at, 1.5);
    assert.equal(body.annotation.text, "The search box has no label.");

    const listed = (await (await fetch(`${srv.url}/api/recordings/${id}/annotations`)).json()) as { annotations: { id: string; text: string }[] };
    assert.equal(listed.annotations.length, 1);
    assert.equal(listed.annotations[0]!.text, "The search box has no label.");

    // A note with nothing in it is not a note.
    const empty = await fetch(`${srv.url}/api/recordings/${id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: 1, text: "   " }),
    });
    assert.equal(empty.status, 400);

    // A note with no place in the video is not a note either.
    const homeless = await fetch(`${srv.url}/api/recordings/${id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: -4, text: "Nowhere" }),
    });
    assert.equal(homeless.status, 400);

    const removed = await fetch(`${srv.url}/api/recordings/${id}/annotations/${body.annotation.id}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    const after = (await (await fetch(`${srv.url}/api/recordings/${id}/annotations`)).json()) as { annotations: unknown[] };
    assert.equal(after.annotations.length, 0);
  } finally {
    await srv.close?.();
  }
});

test("notes ride on a share link only when the owner asks for it", async () => {
  const root = mkdtempSync(join(tmpdir(), "walkcast-notes-"));
  roots.push(root);
  const id = aRecording(root);
  const srv = await server(root, 7500 + Math.floor(Math.random() * 300));
  try {
    await fetch(`${srv.url}/api/recordings/${id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: 2, text: "Prices are shown without VAT." }),
    });

    // A plain link: the walkthrough, and nothing of the owner's private reading of it.
    const plain = (await (
      await fetch(`${srv.url}/api/recordings/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      })
    ).json()) as { url: string };
    const plainPage = await (await fetch(plain.url)).text();
    assert.match(plainPage, /Here are the products\./);
    assert.ok(!plainPage.includes("Prices are shown without VAT."), "a note stays private until a link carries it");

    // A link that carries the notes: the reader sees what the owner saw.
    const withNotes = (await (
      await fetch(`${srv.url}/api/recordings/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7, includeNotes: true }),
      })
    ).json()) as { url: string };
    const notesPage = await (await fetch(withNotes.url)).text();
    assert.match(notesPage, /Prices are shown without VAT\./);
    assert.match(notesPage, /Notes/);
  } finally {
    await srv.close?.();
  }
});

test("a walkthrough can be embedded in somebody else's site", async () => {
  const root = mkdtempSync(join(tmpdir(), "walkcast-notes-"));
  roots.push(root);
  const id = aRecording(root);
  const srv = await server(root, 7800 + Math.floor(Math.random() * 300));
  try {
    const made = (await (
      await fetch(`${srv.url}/api/recordings/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      })
    ).json()) as { url: string };
    const embed = await fetch(`${made.url}?embed=1`);
    assert.equal(embed.status, 200);
    const html = await embed.text();
    assert.match(html, /<video/, "the embed is the player");
    assert.match(html, /recording\.mp4/, "it plays this walkthrough's video");
    assert.match(html, /Walk it on Walkcast|Watch it on Walkcast/, "it says where it came from");
    // The embed is not the whole page: no sign-in wall, no navigation.
    assert.ok(!html.includes("Continue with Google"), "the embed carries none of the app's shell");
    assert.ok(!html.includes("Sign in"), "the embed carries none of the app's shell");
  } finally {
    await srv.close?.();
  }
});

test("the walkthrough comes out as one Markdown document", async () => {
  const root = mkdtempSync(join(tmpdir(), "walkcast-notes-"));
  roots.push(root);
  const id = aRecording(root);
  const srv = await server(root, 8100 + Math.floor(Math.random() * 300));
  try {
    await fetch(`${srv.url}/api/recordings/${id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at: 2, text: "Prices are shown without VAT." }),
    });
    const res = await fetch(`${srv.url}/api/recordings/${id}/transcript?format=md`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /# Walkthrough — shop\.example/);
    assert.match(body, /## Transcript/);
    assert.match(body, /\*\*0:00\*\* — Opening the shop\./);
    assert.match(body, /## Notes/);
    assert.match(body, /\*\*0:02\*\* — Prices are shown without VAT\./);
  } finally {
    await srv.close?.();
  }
});
