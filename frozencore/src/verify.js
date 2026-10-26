// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { isCanonicalFieldString } from "../../src/field.js";
import { enqueueSnark } from "../../src/snark-runtime.js";
import { ARTIFACTS, PRODUCTION, PROJECT_ROOT, PUBLIC_SIGNALS, SCHEMA, VERSION } from "./constants.js";
import { ProofError } from "./errors.js";
import { assertArtifacts } from "./prove.js";
import { refuseProductionFallback } from "./keys.js";

function artifactVk() {
  assertArtifacts();
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["statement.vk"]), "utf8"));
}

export async function verify(envelope, options = {}) {
  try {
    refuseProductionFallback(options?.mode);
  } catch (error) {
    if (error instanceof ProofError) return false;
    throw error;
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return false;
  if (envelope.schema !== SCHEMA || envelope.version !== VERSION) return false;
  if (envelope.production !== false || PRODUCTION !== false) return false;
  if (envelope.proofSystem !== "groth16" || envelope.curve !== "bn254") return false;
  if (!Array.isArray(envelope.signalNames) || envelope.signalNames.join(",") !== PUBLIC_SIGNALS.join(",")) {
    return false;
  }
  if (!Array.isArray(envelope.publicSignals) || envelope.publicSignals.length !== PUBLIC_SIGNALS.length) {
    return false;
  }
  if (envelope.publicSignals.some((value) => !isCanonicalFieldString(value))) return false;
  if (!envelope.proof || envelope.proof.protocol !== "groth16" || envelope.proof.curve !== "bn128") {
    return false;
  }
  let vk;
  try {
    vk = artifactVk();
  } catch (error) {
    if (error instanceof ProofError) return false;
    throw error;
  }
  return enqueueSnark(() => snarkjs.groth16.verify(vk, envelope.publicSignals, envelope.proof));
}
