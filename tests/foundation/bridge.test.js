// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";
import v2Fixture from "../../fixtures/invalid/v2-public-signals.json" with { type: "json" };
import {
  commitmentImages,
  identifyStatement,
  statementProfiles,
  verificationKeyBinding,
  verifyStatement,
} from "../../src/foundation.js";
import { verify as verifyMini } from "../../src/verifier/verify.js";
import { prove as proveFrozen } from "../../frozencore/src/prove.js";
import { verify as verifyFrozen } from "../../frozencore/src/verify.js";
import { SAMPLE_PARTS } from "../../frozencore/src/sample.js";
import { TEST_SECRET, validEnvelope } from "../helpers.js";

test("profiles keep the statement generations distinct", () => {
  const profiles = statementProfiles();
  const counts = profiles.map((profile) => profile.publicSignals.length);
  assert.deepEqual(counts, [1, 5, 30, 4]);
  const verifiable = profiles.filter((profile) => profile.verifiableHere);
  assert.deepEqual(verifiable.map((profile) => profile.id), ["mini-0.1.0", "frozencore-statement-0.1.0"]);
  assert.equal(verifiable[0].zkey === verifiable[1].zkey, false);
  assert.equal(verifiable[0].verificationKey === verifiable[1].verificationKey, false);
  assert.equal(profiles.find((profile) => profile.id === "frozencore-statement-0.1.0").soleSpecification, false);
  assert.equal(profiles.find((profile) => profile.id === "mini-0.2.0").verifiableHere, false);
  assert.equal(profiles.find((profile) => profile.id === "mini-0.2.0").zkey, "experimental/mini-0.2.0/circuit/mini.zkey");
  const guestProfile = profiles.find((profile) => profile.id === "frozencore-guest");
  assert.equal(guestProfile.verifiableHere, false);
  assert.equal(guestProfile.zkey, "frozencore/dev/guest/guest.zkey");
  assert.notEqual(guestProfile.zkey, profiles.find((profile) => profile.id === "frozencore-statement-0.1.0").zkey);
});

test("verification keys are bound to different public-signal counts", () => {
  const binding = verificationKeyBinding();
  assert.equal(binding.mini.nPublic, 1);
  assert.equal(binding.mini020.nPublic, 5);
  assert.equal(binding.mini.path === binding.mini020.path, false);
  assert.equal(binding.frozencore.nPublic, 30);
  assert.equal(binding.sameKey, false);
  assert.equal(binding.mini.path.includes("frozencore"), false);
  assert.equal(binding.frozencore.path.startsWith("frozencore/"), true);
});

test("the same secret has different commitment images", async () => {
  const images = await commitmentImages(BigInt(TEST_SECRET));
  assert.equal(images.equal, false);
  assert.notEqual(images.mini, images.frozencore);
});

test("each proof verifies only with its own statement", { timeout: 180000 }, async () => {
  const { envelope: mini } = await validEnvelope();
  const frozen = await proveFrozen(SAMPLE_PARTS);
  assert.equal(identifyStatement(mini).id, "mini-0.1.0");
  assert.equal(identifyStatement(frozen).id, "frozencore-statement-0.1.0");
  assert.equal(await verifyStatement(mini), true);
  assert.equal(await verifyStatement(frozen), true);
  assert.equal(await verifyMini(frozen), false);
  assert.equal(await verifyFrozen(mini), false);
  assert.equal(await verifyStatement({ ...mini, schema: frozen.schema, version: frozen.version }), false);
  assert.equal(await verifyStatement({ ...frozen, schema: mini.schema, version: mini.version }), false);
});

test("signal count alone does not select a statement", async () => {
  const unnamed = identifyStatement({ publicSignals: v2Fixture.publicSignals });
  assert.equal(unnamed.verifiable, false);
  assert.equal(unnamed.reason, "signal-count-is-not-a-schema");
  const retiredEnvelope = {
    schema: "aegisproof-mini-public-signals-v1",
    version: "aegisproof-mini-0.1.0",
    publicSignals: ["1"],
  };
  const retired = identifyStatement(retiredEnvelope);
  assert.equal(retired.id, "mini-0.1.0");
  assert.equal(retired.verifiable, true);
  assert.equal(await verifyStatement(retiredEnvelope), false);
});
