// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { ARTIFACTS, PROJECT_ROOT, SCHEMA, VERSION } from "../constants.js";
import { InputError, ProofError } from "../errors.js";
import { isCanonicalFieldString, parseFieldElement } from "../field.js";
import { checkIntegrity } from "../integrity/check.js";
import { enqueueSnark } from "../snark-runtime.js";

const silentLogger = {
  info() {},
  log() {},
  debug() {},
  warn() {},
  error() {},
};

async function withoutWitnessLogs(task) {
  const previous = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    error: console.error,
    warn: console.warn,
  };
  const sink = () => {};
  console.log = sink;
  console.info = sink;
  console.debug = sink;
  console.error = sink;
  console.warn = sink;
  try {
    return await task();
  } finally {
    console.log = previous.log;
    console.info = previous.info;
    console.debug = previous.debug;
    console.error = previous.error;
    console.warn = previous.warn;
  }
}

function parseWitness(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InputError("入力オブジェクトが不正です");
  }
  parseFieldElement(input.secret, "secret");
  parseFieldElement(input.commitment, "commitment");
  return {
    secret: input.secret,
    commitment: input.commitment,
  };
}

function asFieldString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && isCanonicalFieldString(value)) return value;
  throw new ProofError("public signal の形式が不正です", "SCHEMA");
}

function toEnvelope(proof, publicSignals, commitment) {
  if (!Array.isArray(publicSignals) || publicSignals.length !== 1) {
    throw new ProofError("publicSignals の本数が不正です", "SCHEMA");
  }
  const normalized = [asFieldString(publicSignals[0])];
  if (BigInt(normalized[0]) !== BigInt(commitment)) {
    throw new ProofError("public signal が commitment と一致しません", "SCHEMA");
  }
  if (!proof || proof.protocol !== "groth16" || proof.curve !== "bn128") {
    throw new ProofError("証明オブジェクトの形式が不正です", "SCHEMA");
  }
  return {
    version: VERSION,
    schema: SCHEMA,
    protocol: "groth16",
    curve: "bn254",
    publicSignals: normalized,
    proof,
  };
}

async function proveUnlocked(parsed, root) {
  await checkIntegrity(root);
  const wasmPath = path.join(root, ARTIFACTS["circuit.wasm"]);
  const zkeyPath = path.join(root, ARTIFACTS["circuit.zkey"]);
  let generated;
  try {
    generated = await withoutWitnessLogs(() =>
      snarkjs.groth16.fullProve(
        { secret: parsed.secret, commitment: parsed.commitment },
        wasmPath,
        zkeyPath,
        silentLogger,
      ),
    );
  } catch (err) {
    const raw = String(err && err.message ? err.message : "");
    if (/Assert Failed|Error in template|constraint/i.test(raw)) {
      throw new ProofError("制約を満たさない入力です", "CONSTRAINT");
    }
    throw new ProofError("証明の生成に失敗しました");
  }
  return toEnvelope(generated.proof, generated.publicSignals, parsed.commitment);
}

export function prove(input, root = PROJECT_ROOT) {
  try {
    const parsed = parseWitness(input);
    return enqueueSnark(() => proveUnlocked(parsed, root));
  } catch (err) {
    return Promise.reject(err);
  }
}

export async function proveToFile(input, outputPath, root = PROJECT_ROOT) {
  const envelope = await prove(input, root);
  fs.writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`);
  return envelope;
}
