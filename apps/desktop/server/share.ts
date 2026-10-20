import { randomBytes } from "node:crypto";

/**
 * Share links: a walkthrough that anyone with the link can watch.
 *
 * The token is the permission. It is 24 random bytes, so it cannot be guessed and cannot be
 * enumerated, and the link stops working on the day it says it does. There is no account, no
 * sign-in and no cookie on the other side: that is the point of sending someone a link.
 *
 * The token lives in the walkthrough's own summary, next to the video it points at, so
 * revoking a link is removing a line and asking the page to stop existing.
 */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** A token in a URL is base64url: letters, digits, dash and underscore. */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
