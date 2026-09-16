import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the root document does not depend on blocked Google font hosts", () => {
  const src = readFileSync(join(TEMPLATE_ROOT, "src/routes/__root.tsx"), "utf8");
  assert.doesNotMatch(src, /fonts\.googleapis\.com/);
  assert.doesNotMatch(src, /fonts\.gstatic\.com/);
});
