// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PROJECT_ROOT } from "../src/constants.js";

function source(rel) {
  return fs.readFileSync(path.join(PROJECT_ROOT, rel), "utf8");
}

test("prover, verifier, and integrity stay separated", () => {
  const prover = source("src/prover/prove.js");
  const verifier = source("src/verifier/verify.js");
  const integrity = source("src/integrity/check.js");
  assert.equal(prover.includes("verifier/"), false);
  assert.equal(verifier.includes("prover/"), false);
  assert.equal(integrity.includes("prover/"), false);
  assert.equal(integrity.includes("verifier/"), false);
  assert.equal(prover.includes("skipIntegrity"), false);
  assert.equal(verifier.includes("skipIntegrity"), false);
  assert.equal(integrity.includes("skipIntegrity"), false);
  assert.equal(prover.includes("return true;"), false);
  assert.equal(verifier.includes("return true;"), false);
  assert.equal(source("src/authenticity/mldsa.js").includes("prover/"), false);
});
