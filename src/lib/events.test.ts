import test from "node:test";
import assert from "node:assert/strict";

import { buildRoomSlug, slugifyEventName } from "./events.ts";

test("slugifyEventName turns a booth name into a public room slug", () => {
  assert.equal(slugifyEventName("Cheers to 50 Years!"), "cheers-to-50-years");
  assert.equal(slugifyEventName("  DJ Jimmy Jams  "), "dj-jimmy-jams");
});

test("buildRoomSlug keeps a readable slug but falls back to a generated code", () => {
  assert.equal(buildRoomSlug("Cheers to 50 Years!"), "cheers-to-50-years");
  assert.equal(buildRoomSlug(""), "night");
});
