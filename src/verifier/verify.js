// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { ARTIFACTS, PROJECT_ROOT, SCHEMA, VERSION } from "../constants.js";
import { isCanonicalFieldString } from "../field.js";
import { checkIntegrity } from "../integrity/check.js";
import { enqueueSnark } from "../snark-runtime.js";

function isMiniVerificationKey(vkey) {
  return Boolean(
    vkey &&
      vkey.protocol === "groth16" &&
      vkey.curve === "bn128" &&
      vkey.nPublic === 1 &&
      Array.isArray(vkey.vk_alpha_1) &&
      Array.isArray(vkey.vk_beta_2) &&
      Array.isArray(vkey.vk_gamma_2) &&
      Array.isArray(vkey.vk_delta_2) &&
      Array.isArray(vkey.IC) &&
      vkey.IC.length === 2,
  );
}

function isGroth16Proof(proof) {
  return Boolean(
    proof &&
      proof.protocol === "groth16" &&
      proof.curve === "bn128" &&
      Array.isArray(proof.pi_a) &&
      proof.pi_a.length === 3 &&
      Array.isArray(proof.pi_b) &&
      proof.pi_b.length === 3 &&
      Array.isArray(proof.pi_c) &&
      proof.pi_c.length === 3,
  );
}

function isMiniPublicSignals(publicSignals) {
  return Boolean(
    Array.isArray(publicSignals) &&
      publicSignals.length === 1 &&
      isCanonicalFieldString(publicSignals[0]),
  );
}

// Cryptographic verification only. Disk integrity is enforced by verify().
export async function verifyGroth16(vkey, publicSignals, proof) {
  if (!isMiniVerificationKey(vkey)) return false;
  if (!isMiniPublicSignals(publicSignals)) return false;
  if (!isGroth16Proof(proof)) return false;
  return enqueueSnark(async () => {
    try {
      const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      return ok === true;
    } catch {
      return false;
    }
  });
}

export function readEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== VERSION || value.schema !== SCHEMA) return null;
  if (value.protocol !== "groth16" || value.curve !== "bn254") return null;
  if (!isMiniPublicSignals(value.publicSignals) || !isGroth16Proof(value.proof)) return null;
  return value;
}

export async function verify(envelope, root = PROJECT_ROOT) {
  const parsed = readEnvelope(envelope);
  if (!parsed) return false;
  await checkIntegrity(root);
  const vkeyPath = path.join(root, ARTIFACTS["verification_key.json"]);
  let vkey;
  try {
    vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  } catch {
    return false;
  }
  return verifyGroth16(vkey, parsed.publicSignals, parsed.proof);
}
