// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { sha256File } from "../../src/integrity/hash.js";
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
import { InputError, ProofError } from "./errors.js";
import { guestFromParts } from "./guest.js";
import { LEGACY_GUEST_R1CS, refuseProductionFallback, assertDistinctFromLegacy } from "./keys.js";

const silentLogger = {
  info() {},
  log() {},
  debug() {},
  warn() {},
  error() {},
};

function artifactPath(name) {
  return path.join(PROJECT_ROOT, ARTIFACTS[name]);
}

export function assertGuestArtifacts() {
  const manifestPath = artifactPath("guest.manifest");
  if (!fs.existsSync(manifestPath)) throw new ProofError("guest の manifest がありません", "ARTIFACT");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.production !== false || manifest.version !== GUEST_VERSION || manifest.schema !== GUEST_SCHEMA) {
    throw new ProofError("guest の manifest がこの版と一致しません", "ARTIFACT");
  }
  if (manifest.circuit?.publicInputs !== GUEST_PUBLIC_SIGNALS.length) {
    throw new ProofError("guest manifest の公開入力数が 4 ではありません", "ARTIFACT");
  }
  if (manifest.ceremony?.production !== false || manifest.ceremony?.contributors !== 1) {
    throw new ProofError("guest のセレモニー記録が開発用の単一貢献者ではありません", "ARTIFACT");
  }
  for (const name of ["guest.wasm", "guest.r1cs", "guest.zkey", "guest.vk", "guest.ptau"]) {
    const filePath = artifactPath(name);
    if (!fs.existsSync(filePath)) throw new ProofError(`${name} がありません`, "ARTIFACT");
    if (sha256File(filePath) !== manifest.artifacts[name]) {
      throw new ProofError(`${name} の SHA-256 が guest manifest と一致しません`, "ARTIFACT");
    }
  }
  const vk = JSON.parse(fs.readFileSync(artifactPath("guest.vk"), "utf8"));
  if (vk.protocol !== "groth16" || vk.curve !== "bn128" || vk.nPublic !== 4 || vk.IC?.length !== 5) {
    throw new ProofError("guest の検証鍵が 4 公開入力の Groth16 ではありません", "ARTIFACT");
  }
  const statementVkPath = artifactPath("statement.vk");
  if (fs.existsSync(statementVkPath) && sha256File(statementVkPath) === sha256File(artifactPath("guest.vk"))) {
    throw new ProofError("guest の検証鍵が statement の検証鍵と同一です", "ARTIFACT");
  }
  assertDistinctFromLegacy("guest.r1cs", LEGACY_GUEST_R1CS);
  return manifest;
}

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

function applyOverrides(witness, overrides) {
  if (!overrides) return witness;
  if (typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new InputError("上書きが不正です");
  }
  const next = { ...witness };
  for (const [key, value] of Object.entries(overrides)) {
    if (!GUEST_PUBLIC_SIGNALS.includes(key)) throw new InputError("公開信号以外は上書きできません");
    if (typeof value !== "string" || !isCanonicalFieldString(value)) {
      throw new InputError(`${key} の上書きが正規のフィールド要素ではありません`);
    }
    next[key] = value;
  }
  return next;
}

export async function proveGuest(parts, options = {}) {
  refuseProductionFallback(options.mode);
  assertGuestArtifacts();
  const guest = await guestFromParts(parts);
  const witness = applyOverrides(guest.witness, options.publicOverrides);
  const expected = GUEST_PUBLIC_SIGNALS.map((name) => witness[name]);
  const result = await enqueueSnark(() => withoutWitnessLogs(() => snarkjs.groth16.fullProve(
    witness,
    artifactPath("guest.wasm"),
    artifactPath("guest.zkey"),
    silentLogger,
  )));
  const publicSignals = result.publicSignals.map((value) => {
    const textValue = typeof value === "bigint" ? value.toString() : String(value);
    if (!isCanonicalFieldString(textValue)) throw new ProofError("公開信号の形式が不正です", "SCHEMA");
    return textValue;
  });
  if (publicSignals.length !== 4 || publicSignals.join(",") !== expected.join(",")) {
    throw new ProofError("公開信号が guest の順序と一致しません", "SCHEMA");
  }
  if (result.proof?.protocol !== "groth16" || result.proof?.curve !== "bn128") {
    throw new ProofError("証明オブジェクトの形式が不正です", "SCHEMA");
  }
  return {
    schema: GUEST_SCHEMA,
    version: GUEST_VERSION,
    production: PRODUCTION,
    proofSystem: "groth16",
    curve: "bn254",
    signalNames: [...GUEST_PUBLIC_SIGNALS],
    publicSignals,
    proof: result.proof,
  };
}
