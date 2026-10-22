import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { serveDashboard } from "../apps/desktop/server/server.ts";

/**
 * A walkthrough you can send to someone.
 *
 * A link is the whole point: the person who opens it has no account, signs in nowhere, and
 * watches the video with its captions and transcript. What it must not be is a hole — the
 * token is the permission, it is unguessable, it expires, and the owner can switch it off.
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
      actions: [{ at: 1.2, kind: "click", name: "Products", url: "https://shop.example/", shot: "step-01.jpg" }],
      media: { video: "video.webm", mp4: "recording.mp4", webm: "narrated.webm", audio: "narration.wav", captions: "captions.vtt", voice: "flite", note: "" },
    }),
  );
  writeFileSync(join(dir, "recording.mp4"), "not really a video");
  writeFileSync(join(dir, "captions.vtt"), "WEBVTT\n");
  writeFileSync(join(dir, "step-01.jpg"), "not really a picture");
  writeFileSync(join(dir, "recording.json.bak"), "{}");
  return id;
}

test("a share link plays the walkthrough for anyone who has it, and only for them", async () => {
  const root = mkdtempSync(join(tmpdir(), "walkcast-share-"));
  roots.push(root);
  const id = aRecording(root);
  const srv = await serveDashboard(6500 + Math.floor(Math.random() * 300), { root, unref: true, requireAuth: false });
  try {
    // The link is made by the owner.
    const made = await fetch(`${srv.url}/api/recordings/${id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7 }),
    });
    assert.equal(made.status, 200, await made.clone().text());
    const body = (await made.json()) as { url: string; share: { token: string; expiresAt: string }; shares: unknown[] };
    assert.ok(body.url.includes(`/share/${id}/`), body.url);
    assert.equal(body.shares.length, 1);
    // The token is not something a person would guess.
    assert.ok(body.share.token.length >= 20);

    // Anyone can open the page: no account, no cookie, no sign-in.
    const page = await fetch(body.url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Walkthrough/);
    assert.match(html, /Here are the products\./, "the transcript is on the page");
    assert.match(html, /shop\.example/);

    // The video and the captions are served through the same link.
    const video = await fetch(`${body.url}/recording.mp4`);
    assert.equal(video.status, 200);
    assert.equal(await video.text(), "not really a video");
    const captions = await fetch(`${body.url}/captions.vtt`);
    assert.equal(captions.status, 200);
    assert.match(await captions.text(), /WEBVTT/);

    // The same link reads as a step-by-step guide: numbered steps, the action named, the
    // picture it took of the control, and no account needed for any of it.
    assert.match(html, /Read it as a step-by-step guide/);
    const guide = await fetch(`${body.url}/guide`);
    assert.equal(guide.status, 200);
    const guideHtml = await guide.text();
    assert.match(guideHtml, /Click “Products”/);
    assert.match(guideHtml, /step-01\.jpg/);
    const markdown = await fetch(`${body.url}/guide?format=md`);
    assert.equal(markdown.status, 200);
    assert.match(await markdown.text(), /## 1\. Open Shop[\s\S]*## 2\. Click “Products”/);
    const stepPicture = await fetch(`${body.url}/step-01.jpg`);
    assert.equal(stepPicture.status, 200, "the guide's pictures travel with the link");

    // The owner gets the same guide from the stored summary, without a share token.
    const ownerGuide = await fetch(`${srv.url}/api/recordings/${id}/guide`);
    assert.equal(ownerGuide.status, 200);
    assert.match(await ownerGuide.text(), /Click “Products”/);
    const ownerMarkdown = await fetch(`${srv.url}/api/recordings/${id}/guide?format=md`);
    assert.equal(ownerMarkdown.status, 200);
    assert.match(await ownerMarkdown.text(), /## 1\. Open Shop[\s\S]*## 2\. Click “Products”/);

    // Only the files this walkthrough published. The rest of its folder is not a doorway.
    const other = await fetch(`${body.url}/recording.json.bak`);
    assert.equal(other.status, 404);
    const elsewhere = await fetch(`${body.url}/../../recordings`);
    assert.ok(elsewhere.status === 404 || elsewhere.status === 301, "the link does not reach outside the walkthrough");

    // A token that was never issued is refused.
    const wrong = await fetch(`${srv.url}/share/${id}/aaaaaaaaaaaaaaaaaaaaaaaa`);
    assert.equal(wrong.status, 404);

    // The owner can switch it off, and then it is gone.
    const revoked = await fetch(`${srv.url}/api/recordings/${id}/share?token=${body.share.token}`, { method: "DELETE" });
    assert.equal(revoked.status, 200);
    assert.equal(((await revoked.json()) as { shares: unknown[] }).shares.length, 0);
    const after = await fetch(body.url);
    assert.equal(after.status, 404, "a switched-off link does not work any more");
  } finally {
    await srv.close?.();
  }
});

test("a share link stops working on the day it names", async () => {
  const root = mkdtempSync(join(tmpdir(), "walkcast-share-"));
  roots.push(root);
  const id = aRecording(root);
  const srv = await serveDashboard(6900 + Math.floor(Math.random() * 300), { root, unref: true, requireAuth: false });
  try {
    const made = await fetch(`${srv.url}/api/recordings/${id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 1 }),
    });
    const body = (await made.json()) as { url: string; share: { token: string; createdAt: string; expiresAt: string } };
    const days = Math.round((Date.parse(body.share.expiresAt) - Date.now()) / 86_400_000);
    assert.ok(days >= 0 && days <= 1, `the link was given ${days} days`);

    // An expiry in the past is not a link: the server refuses it even though the token is right.
    const file = join(root, "recordings", id, "recording.json");
    const summary = JSON.parse(readFileSync(file, "utf8")) as { shares: { token: string; createdAt: string; expiresAt: string }[] };
    summary.shares = [{ ...body.share, token: summary.shares[0]!.token, expiresAt: new Date(Date.now() - 1000).toISOString() }];
    writeFileSync(file, JSON.stringify(summary));
    const expired = await fetch(body.url);
    assert.equal(expired.status, 404, "an expired link is refused");
  } finally {
    await srv.close?.();
  }
});

test("the embed can sit in another site's iframe; the share page and the app cannot", async () => {
  const root = mkdtempSync(join(tmpdir(), "walkcast-share-"));
  roots.push(root);
  const id = aRecording(root);
  const srv = await serveDashboard(7300 + Math.floor(Math.random() * 300), { root, unref: true, requireAuth: false });
  try {
    const made = await fetch(`${srv.url}/api/recordings/${id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 7 }) });
    const { url } = (await made.json()) as { url: string };
    const embed = await fetch(`${url}?embed=1`);
    assert.equal(embed.status, 200);
    assert.equal(embed.headers.get("x-frame-options"), null, "X-Frame-Options would blank the iframe on every other site");
    assert.match(embed.headers.get("content-security-policy") ?? "", /frame-ancestors \*/);
    assert.equal((await fetch(url)).headers.get("x-frame-options"), "SAMEORIGIN", "the full share page stays unframable");
  } finally {
    await srv.close?.();
  }
});
