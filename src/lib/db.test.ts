import test from "node:test";
import assert from "node:assert/strict";

import { getPgliteDataDir } from "./db.ts";

test("PGlite fallback uses an in-memory data dir", () => {
  assert.equal(getPgliteDataDir(), "memory://cue");
});
