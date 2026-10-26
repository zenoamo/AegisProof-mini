// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import * as snarkjs from "snarkjs";
import { sha256File } from "../../src/integrity/hash.js";
import { ARTIFACTS, PROJECT_ROOT } from "../src/constants.js";
import { ProofError } from "../src/errors.js";
import {
  LEGACY_STATEMENT_R1CS,
  LEGACY_STATEMENT_VK,
  LEGACY_STATEMENT_ZKEY,
  activeHashesMatchManifest,
  assertDistinctFromLegacy,
  assertOutputAllowed,
  assertVerifierRole,
  refuseProductionFallback,
  resolveVerificationKey,
} from "../src/keys.js";

function abs(rel) {
  return path.join(PROJECT_ROOT, rel);
}

test("active artifact hashes match their manifests and differ from legacy files", () => {
  const before = {
    legacyZkey: sha256File(abs(LEGACY_STATEMENT_ZKEY)),
    legacyR1cs: sha256File(abs(LEGACY_STATEMENT_R1CS)),
    legacyVk: sha256File(abs(LEGACY_STATEMENT_VK)),
    activeZkey: sha256File(abs(ARTIFACTS["statement.zkey"])),
  };
  activeHashesMatchManifest();
  assertDistinctFromLegacy("statement.r1cs", LEGACY_STATEMENT_R1CS);
  assertDistinctFromLegacy("statement.zkey", LEGACY_STATEMENT_ZKEY);
  assertDistinctFromLegacy("statement.vk", LEGACY_STATEMENT_VK);
  assertDistinctFromLegacy("guest.r1cs", "frozencore/artifacts/guest.r1cs");
  assert.notEqual(before.activeZkey, before.legacyZkey);
  assert.equal(sha256File(abs(LEGACY_STATEMENT_ZKEY)), before.legacyZkey);
  assert.equal(sha256File(abs(LEGACY_STATEMENT_R1CS)), before.legacyR1cs);
  assert.equal(sha256File(abs(LEGACY_STATEMENT_VK)), before.legacyVk);
  const statementVk = JSON.parse(fs.readFileSync(abs(ARTIFACTS["statement.vk"]), "utf8"));
  const guestVk = JSON.parse(fs.readFileSync(abs(ARTIFACTS["guest.vk"]), "utf8"));
  assertVerifierRole(statementVk, "statement");
  assertVerifierRole(guestVk, "guest");
  assert.throws(() => assertVerifierRole(statementVk, "guest"), ProofError);
  assert.throws(() => assertVerifierRole(guestVk, "statement"), ProofError);
  assert.equal(resolveVerificationKey("statement"), ARTIFACTS["statement.vk"]);
  assert.throws(() => resolveVerificationKey("statement", "production"), ProofError);
  assert.throws(() => refuseProductionFallback("production"), ProofError);
  assert.throws(() => resolveVerificationKey("other"), ProofError);
});

test("protected paths are not write targets and the legacy build does not overwrite them", () => {
  const legacyZkey = abs(LEGACY_STATEMENT_ZKEY);
  const before = sha256File(legacyZkey);
  assert.throws(() => assertOutputAllowed(LEGACY_STATEMENT_ZKEY), ProofError);
  assert.throws(() => assertOutputAllowed("circuit/mini.zkey"), ProofError);
  assert.doesNotThrow(() => assertOutputAllowed("frozencore/dev/statement/statement.zkey"));
  const result = spawnSync(process.execPath, ["frozencore/scripts/build.js"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.equal(sha256File(legacyZkey), before);
  assert.equal(fs.existsSync(legacyZkey), true);
});

test("the legacy statement key does not verify the active R1CS and there is no fallback", { timeout: 180000 }, async () => {
  let matches = false;
  try {
    matches = await snarkjs.zKey.verifyFromR1cs(
      abs(ARTIFACTS["statement.r1cs"]),
      abs("frozencore/setup/statement/pot_final.ptau"),
      abs(LEGACY_STATEMENT_ZKEY),
    );
  } catch {
    matches = false;
  }
  assert.notEqual(matches, true);
  const active = await snarkjs.zKey.verifyFromR1cs(
    abs(ARTIFACTS["statement.r1cs"]),
    abs(ARTIFACTS["statement.ptau"]),
    abs(ARTIFACTS["statement.zkey"]),
  );
  assert.equal(active, true);
});
