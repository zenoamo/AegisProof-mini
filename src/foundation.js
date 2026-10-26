// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import { ARTIFACTS, PROJECT_ROOT, PUBLIC_SIGNALS, SCHEMA, VERSION } from "./constants.js";
import { poseidonCommitment, poseidonHash } from "./commitment.js";
import { verify as verifyMini } from "./verifier/verify.js";
import {
  ARTIFACTS as FROZEN_ARTIFACTS,
  DOMAINS,
  GUEST_PUBLIC_SIGNALS,
  PUBLIC_SIGNALS as FROZEN_SIGNALS,
  SCHEMA as FROZEN_SCHEMA,
  VERSION as FROZEN_VERSION,
} from "../frozencore/src/constants.js";
import { verify as verifyFrozen } from "../frozencore/src/verify.js";

export const RETIRED_MINI_SCHEMA = "aegisproof-mini-public-signals-v1";
export const RETIRED_MINI_VERSION = "aegisproof-mini-0.1.0";
export const MINI_010_LOCAL_ACCEPTANCE = "canonical";
export const MINI_020_ROOT = "experimental/mini-0.2.0";

// Profiles describe statements this repository can name.
// verifiableHere means the working tree has the matching circuit and key.
export function statementProfiles() {
  return [
    {
      id: "mini-0.1.0",
      schema: RETIRED_MINI_SCHEMA,
      version: RETIRED_MINI_VERSION,
      publicSignals: ["commitment"],
      commitment: "Poseidon(secret)",
      circuit: "circuit/main.circom",
      zkey: ARTIFACTS["circuit.zkey"],
      verificationKey: ARTIFACTS["verification_key.json"],
      circuitInWorkingTree: true,
      keysInWorkingTree: true,
      verifiableHere: true,
      localAcceptance: "canonical",
      externalCheck: "Canonical paths hold the committed 1-signal generation. Sepolia still records publicSignalCount 1.",
    },
    {
      id: "mini-0.2.0",
      schema: "aegisproof-mini-public-signals-v2",
      version: "aegisproof-mini-0.2.0",
      publicSignals: ["commitment", "nullifier", "contextHash", "policyId", "epoch"],
      circuit: `${MINI_020_ROOT}/circuit/main.circom`,
      zkey: `${MINI_020_ROOT}/circuit/mini.zkey`,
      verificationKey: `${MINI_020_ROOT}/keys/verification_key.json`,
      commitment: "Poseidon(secret)",
      contextHash: "Poseidon(2, context)",
      nullifier: "Poseidon(3, secret, contextHash, policyId, epoch)",
      verifiableHere: false,
      externalCheck: "Preserved under experimental/mini-0.2.0. The root verifier must not use this key. zkey verify r1cs is not done.",
    },
    {
      id: "frozencore-statement-0.1.0",
      schema: FROZEN_SCHEMA,
      version: FROZEN_VERSION,
      publicSignals: [...FROZEN_SIGNALS],
      circuit: "frozencore/circuit/statement.circom",
      zkey: FROZEN_ARTIFACTS["statement.zkey"],
      verificationKey: FROZEN_ARTIFACTS["statement.vk"],
      commitment: "Poseidon(16, secret)",
      contextHash: "Poseidon(18, context)",
      nullifier: "Poseidon(24, secret, contextHash, policyId, policyVersion, epoch, executionId, domainSeparator)",
      verifiableHere: true,
      soleSpecification: false,
    },
    {
      id: "frozencore-guest",
      schema: null,
      publicSignals: [...GUEST_PUBLIC_SIGNALS],
      circuit: "frozencore/circuit/guest.circom",
      zkey: FROZEN_ARTIFACTS["guest.zkey"],
      verificationKey: FROZEN_ARTIFACTS["guest.vk"],
      verifiableHere: false,
      externalCheck: "Fixed 4-step development key under frozencore/dev/guest. Not production. verifyStatement does not route this circuit, and the key is not the statement key.",
    },
  ];
}

export function identifyStatement(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { id: null, verifiable: false, reason: "not-an-envelope" };
  }
  const count = Array.isArray(envelope.publicSignals) ? envelope.publicSignals.length : null;
  if (
    envelope.schema === "aegisproof-mini-public-signals-v2" &&
    envelope.version === "aegisproof-mini-0.2.0" &&
    count === 5
  ) {
    return { id: "mini-0.2.0", verifiable: false, reason: "experimental-tree" };
  }
  if (
    envelope.schema === FROZEN_SCHEMA &&
    envelope.version === FROZEN_VERSION &&
    envelope.production === false &&
    count === FROZEN_SIGNALS.length
  ) {
    return { id: "frozencore-statement-0.1.0", verifiable: true };
  }
  if (envelope.schema === SCHEMA && envelope.version === VERSION && count === PUBLIC_SIGNALS.length) {
    return { id: "mini-0.1.0", verifiable: true };
  }
  if (envelope.schema === RETIRED_MINI_SCHEMA || envelope.version === RETIRED_MINI_VERSION) {
    return { id: "mini-0.1.0", verifiable: false, reason: "signal-count-does-not-match-0.1.0" };
  }
  if (count === FROZEN_SIGNALS.length) {
    return { id: null, verifiable: false, reason: "signal-count-is-not-a-schema" };
  }
  return { id: null, verifiable: false, reason: "unknown-statement" };
}

// Selects the verifier whose schema and key match the envelope.
// A proof from one statement is never checked with the other statement's key.
export async function verifyStatement(envelope) {
  const found = identifyStatement(envelope);
  if (found.id === "mini-0.1.0" && found.verifiable) return verifyMini(envelope);
  if (found.id === "frozencore-statement-0.1.0") return verifyFrozen(envelope);
  return false;
}

export async function commitmentImages(secret) {
  if (typeof secret !== "bigint") {
    throw new TypeError("secret は bigint である必要があります");
  }
  const mini = await poseidonCommitment(secret);
  const frozencore = await poseidonHash([DOMAINS.COMMITMENT, secret]);
  return { mini, frozencore, equal: mini === frozencore };
}

export function verificationKeyBinding() {
  const miniVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["verification_key.json"]), "utf8"));
  const mini020Path = `${MINI_020_ROOT}/keys/verification_key.json`;
  const mini020Vk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, mini020Path), "utf8"));
  const frozenVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, FROZEN_ARTIFACTS["statement.vk"]), "utf8"));
  return {
    mini: { nPublic: miniVk.nPublic, path: ARTIFACTS["verification_key.json"] },
    mini020: { nPublic: mini020Vk.nPublic, path: mini020Path },
    frozencore: { nPublic: frozenVk.nPublic, path: FROZEN_ARTIFACTS["statement.vk"] },
    sameKey: JSON.stringify(miniVk.IC) === JSON.stringify(frozenVk.IC),
  };
}
