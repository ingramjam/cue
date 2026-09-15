import test from "node:test";
import assert from "node:assert/strict";

import { buildPublicUrl, normalizePublicSiteUrl } from "./site.ts";

test("normalizePublicSiteUrl trims trailing slashes", () => {
  assert.equal(normalizePublicSiteUrl("https://cue.example.com/"), "https://cue.example.com");
  assert.equal(normalizePublicSiteUrl("https://cue.example.com"), "https://cue.example.com");
});

test("buildPublicUrl appends the room path to the configured public site URL", () => {
  assert.equal(
    buildPublicUrl("/r/C7HSZH22", "https://cue.example.com/"),
    "https://cue.example.com/r/C7HSZH22",
  );
});
