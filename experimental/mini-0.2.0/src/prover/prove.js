// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { ARTIFACTS, PROJECT_ROOT, PUBLIC_SIGNALS, SCHEMA, VERSION } from "../constants.js";
import { InputError, ProofError } from "../errors.js";
import { isCanonicalFieldString, parseFieldElement } from "../field.js";
import { checkIntegrity } from "../integrity/check.js";
import { enqueueSnark } from "../snark-runtime.js";
import { statementFromParts } from "../statement.js";

const INPUT_KEYS = new Set([
  "secret",
  "context",
  "commitment",
  "nullifier",
  "contextHash",
  "policyId",
  "epoch",
]);

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

function requireField(input, name) {
  if (!Object.hasOwn(input, name)) throw new InputError(`${name} がありません`);
  return parseFieldElement(input[name], name).toString();
}

function optionalField(input, name) {
  if (!Object.hasOwn(input, name)) return undefined;
  return parseFieldElement(input[name], name).toString();
}

function parseWitness(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InputError("入力オブジェクトが不正です");
  }
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.has(key)) throw new InputError("入力に未知のフィールドがあります");
  }
  return {
    secret: requireField(input, "secret"),
    context: requireField(input, "context"),
    policyId: requireField(input, "policyId"),
    epoch: requireField(input, "epoch"),
    commitment: optionalField(input, "commitment"),
    nullifier: optionalField(input, "nullifier"),
    contextHash: optionalField(input, "contextHash"),
  };
}

function asFieldString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && isCanonicalFieldString(value)) return value;
  throw new ProofError("public signal の形式が不正です", "SCHEMA");
}

function toEnvelope(proof, publicSignals, expected) {
  if (!Array.isArray(publicSignals) || publicSignals.length !== PUBLIC_SIGNALS.length) {
    throw new ProofError("publicSignals の本数が不正です", "SCHEMA");
  }
  const normalized = publicSignals.map((value) => asFieldString(value));
  for (let index = 0; index < expected.length; index += 1) {
    if (normalized[index] !== expected[index]) {
      throw new ProofError("publicSignals が仕様の順序と一致しません", "SCHEMA");
    }
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

function witnessForCircuit(parsed, expected) {
  return {
    secret: parsed.secret,
    context: parsed.context,
    commitment: parsed.commitment ?? expected.commitment,
    nullifier: parsed.nullifier ?? expected.nullifier,
    contextHash: parsed.contextHash ?? expected.contextHash,
    policyId: parsed.policyId,
    epoch: parsed.epoch,
  };
}

async function proveUnlocked(parsed, root) {
  await checkIntegrity(root);
  const expected = await statementFromParts({
    secret: BigInt(parsed.secret),
    context: BigInt(parsed.context),
    policyId: BigInt(parsed.policyId),
    epoch: BigInt(parsed.epoch),
  });
  const wasmPath = path.join(root, ARTIFACTS["circuit.wasm"]);
  const zkeyPath = path.join(root, ARTIFACTS["circuit.zkey"]);
  let generated;
  try {
    generated = await withoutWitnessLogs(() =>
      snarkjs.groth16.fullProve(
        witnessForCircuit(parsed, expected),
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
  return toEnvelope(generated.proof, generated.publicSignals, expected.publicSignals);
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
