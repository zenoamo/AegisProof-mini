// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProofError } from "../../../../frozencore/src/errors.js";
import { checkAttestation, checkWallClock, checkZkvm } from "../../../../frozencore/src/external.js";
import { assertOutputAllowed, refuseProductionFallback } from "../../../../frozencore/src/keys.js";

const miniRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../mini-0.2.0");

function source(rel) {
  return fs.readFileSync(path.join(miniRoot, rel), "utf8");
}

test("the mini build does not write baseline or a production ceremony", () => {
  const build = source("scripts/build.js");
  const manifestWriter = source("src/integrity/manifest.js");
  assert.match(build, /artifacts\/baseline\.json は更新していません/);
  assert.equal(build.includes("BASELINE_REL"), false);
  assert.equal(build.includes("production: false"), true);
  assert.equal(manifestWriter.includes("baseline"), false);
  assert.match(manifestWriter, /production !== false/);
});

test("the verifier export writes v2 and refuses to change the deployed verifier", () => {
  const script = source("sepolia/scripts/export-verifier.js");
  assert.match(script, /Groth16VerifierV2\.sol/);
  assert.match(script, /Groth16Verifier\.sol/);
  assert.match(script, /nPublic !== 5/);
  assert.match(script, /frozenBefore\.equals\(frozenAfter\)/);
  assert.match(script, /デプロイ済み Groth16Verifier\.sol が変更されました/);
});

test("development keys and unset external checks do not become production success", () => {
  assert.throws(() => refuseProductionFallback("production"), ProofError);
  assert.equal(checkWallClock().verified, false);
  assert.equal(checkZkvm().verified, false);
  assert.equal(checkAttestation().verified, false);
  assert.throws(() => assertOutputAllowed("circuit/mini.zkey"), ProofError);
  assert.throws(() => assertOutputAllowed("keys/verification_key.json"), ProofError);
  assert.throws(() => assertOutputAllowed("frozencore/artifacts/statement.zkey"), ProofError);
  assert.throws(() => assertOutputAllowed("frozencore/keys/statement_verification_key.json"), ProofError);
  assert.throws(() => assertOutputAllowed("frozencore/setup/statement/pot_final.ptau"), ProofError);
  assert.doesNotThrow(() => assertOutputAllowed("frozencore/dev/statement/statement.zkey"));
});
