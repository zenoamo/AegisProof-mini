// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { isCanonicalFieldString } from "../../src/field.js";
import { enqueueSnark } from "../../src/snark-runtime.js";
import {
  ARTIFACTS,
  GUEST_PUBLIC_SIGNALS,
  GUEST_SCHEMA,
  GUEST_VERSION,
  PRODUCTION,
  PROJECT_ROOT,
} from "./constants.js";
import { ProofError } from "./errors.js";
import { assertGuestArtifacts } from "./guest-prove.js";
import { refuseProductionFallback } from "./keys.js";

function guestVk() {
  assertGuestArtifacts();
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.vk"]), "utf8"));
}

export async function verifyGuest(envelope, options = {}) {
  try {
    refuseProductionFallback(options?.mode);
  } catch (error) {
    if (error instanceof ProofError) return false;
    throw error;
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return false;
  if (envelope.schema !== GUEST_SCHEMA || envelope.version !== GUEST_VERSION) return false;
  if (envelope.production !== false || PRODUCTION !== false) return false;
  if (envelope.proofSystem !== "groth16" || envelope.curve !== "bn254") return false;
  if (!Array.isArray(envelope.signalNames) || envelope.signalNames.join(",") !== GUEST_PUBLIC_SIGNALS.join(",")) {
    return false;
  }
  if (!Array.isArray(envelope.publicSignals) || envelope.publicSignals.length !== GUEST_PUBLIC_SIGNALS.length) {
    return false;
  }
  if (envelope.publicSignals.some((value) => !isCanonicalFieldString(value))) return false;
  if (!envelope.proof || envelope.proof.protocol !== "groth16" || envelope.proof.curve !== "bn128") {
    return false;
  }
  let vk;
  try {
    vk = guestVk();
  } catch (error) {
    if (error instanceof ProofError) return false;
    throw error;
  }
  if (vk.nPublic !== 4) return false;
  return enqueueSnark(() => snarkjs.groth16.verify(vk, envelope.publicSignals, envelope.proof));
}
