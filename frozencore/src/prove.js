// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { sha256File } from "../../src/integrity/hash.js";
import { isCanonicalFieldString } from "../../src/field.js";
import { enqueueSnark } from "../../src/snark-runtime.js";
import { ARTIFACTS, PRODUCTION, PROJECT_ROOT, PUBLIC_SIGNALS, SCHEMA, VERSION } from "./constants.js";
import { InputError, ProofError } from "./errors.js";
import { statementFromParts } from "./statement.js";
import {
  LEGACY_STATEMENT_R1CS,
  LEGACY_STATEMENT_VK,
  LEGACY_STATEMENT_ZKEY,
  assertDistinctFromLegacy,
  refuseProductionFallback,
} from "./keys.js";

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

export function assertArtifacts() {
  const manifestPath = artifactPath("manifest");
  if (!fs.existsSync(manifestPath)) throw new ProofError("FrozenCore の manifest がありません", "ARTIFACT");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.production !== false || manifest.version !== VERSION || manifest.schema !== SCHEMA) {
    throw new ProofError("FrozenCore の manifest がこの版と一致しません", "ARTIFACT");
  }
  if (manifest.circuit?.publicInputs !== PUBLIC_SIGNALS.length) {
    throw new ProofError("manifest の公開入力数が 30 ではありません", "ARTIFACT");
  }
  if (manifest.circuit?.programVersionPinned !== true || manifest.ceremony?.production !== false) {
    throw new ProofError("statement の開発用 manifest が programVersion 固定の開発用セットアップではありません", "ARTIFACT");
  }
  if (manifest.ceremony?.contributors !== 1) {
    throw new ProofError("statement のセレモニー記録が開発用の単一貢献者ではありません", "ARTIFACT");
  }
  for (const name of ["statement.wasm", "statement.r1cs", "statement.zkey", "statement.vk", "statement.ptau"]) {
    const filePath = artifactPath(name);
    if (!fs.existsSync(filePath)) throw new ProofError(`${name} がありません`, "ARTIFACT");
    const actual = sha256File(filePath);
    if (actual !== manifest.artifacts[name]) {
      throw new ProofError(`${name} の SHA-256 が manifest と一致しません`, "ARTIFACT");
    }
  }
  const vk = JSON.parse(fs.readFileSync(artifactPath("statement.vk"), "utf8"));
  if (vk.protocol !== "groth16" || vk.curve !== "bn128" || vk.nPublic !== 30 || vk.IC?.length !== 31) {
    throw new ProofError("FrozenCore の検証鍵が 30 公開入力の Groth16 ではありません", "ARTIFACT");
  }
  assertDistinctFromLegacy("statement.r1cs", LEGACY_STATEMENT_R1CS);
  assertDistinctFromLegacy("statement.zkey", LEGACY_STATEMENT_ZKEY);
  assertDistinctFromLegacy("statement.vk", LEGACY_STATEMENT_VK);
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
    if (!PUBLIC_SIGNALS.includes(key)) throw new InputError("公開信号以外は上書きできません");
    if (typeof value !== "string" || !isCanonicalFieldString(value)) {
      throw new InputError(`${key} の上書きが正規のフィールド要素ではありません`);
    }
    next[key] = value;
  }
  return next;
}

export async function prove(parts, options = {}) {
  refuseProductionFallback(options.mode);
  assertArtifacts();
  const statement = await statementFromParts(parts);
  const witness = applyOverrides(statement.witness, options.publicOverrides);
  const expected = PUBLIC_SIGNALS.map((name) => witness[name]);
  const result = await enqueueSnark(() => withoutWitnessLogs(() => snarkjs.groth16.fullProve(
    witness,
    artifactPath("statement.wasm"),
    artifactPath("statement.zkey"),
    silentLogger,
  )));
  const publicSignals = result.publicSignals.map((value) => {
    const text = typeof value === "bigint" ? value.toString() : String(value);
    if (!isCanonicalFieldString(text)) throw new ProofError("公開信号の形式が不正です", "SCHEMA");
    return text;
  });
  if (publicSignals.length !== 30 || publicSignals.join(",") !== expected.join(",")) {
    throw new ProofError("公開信号が仕様の順序と一致しません", "SCHEMA");
  }
  if (result.proof?.protocol !== "groth16" || result.proof?.curve !== "bn128") {
    throw new ProofError("証明オブジェクトの形式が不正です", "SCHEMA");
  }
  return {
    schema: SCHEMA,
    version: VERSION,
    production: PRODUCTION,
    proofSystem: "groth16",
    curve: "bn254",
    signalNames: [...PUBLIC_SIGNALS],
    publicSignals,
    proof: result.proof,
  };
}
