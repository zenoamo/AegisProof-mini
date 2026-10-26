// SPDX-License-Identifier: GPL-3.0-or-later
// Development-only guest ceremony.
// Re-running this script replaces files under frozencore/dev/guest/ only.
// The zkey bytes are not a deterministic transcript: snarkjs mixes the public
// entropy labels below with OS CSPRNG. contributors is 1. production is false.
// Toxic-waste destruction is not established. This is not a production ceremony.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { sha256File } from "../../src/integrity/hash.js";
import { ensureCircom } from "../../scripts/ensure-circom.js";
import {
  ARTIFACTS,
  GUEST_PUBLIC_SIGNALS,
  GUEST_SCHEMA,
  GUEST_VERSION,
  PROJECT_ROOT,
} from "../src/constants.js";

const root = PROJECT_ROOT;
const outDir = path.join(root, "frozencore", "dev", "guest");
const PHASE1_NAME = "frozencore-guest-dev-phase1";
const PHASE2_NAME = "frozencore-guest-dev-phase2";
const PHASE1_ENTROPY = "frozencore-guest-phase1-dev-only-not-production";
const PHASE2_ENTROPY = "frozencore-guest-phase2-dev-only-not-production";
const PROTECTED = [
  "circuit/main.circom",
  "circuit/main.r1cs",
  "circuit/main.wasm",
  "circuit/mini.zkey",
  "keys/verification_key.json",
  "experimental/sepolia/contracts/Groth16Verifier.sol",
  "experimental/sepolia/deployments/sepolia.json",
  "experimental/sepolia/deployments/public-proof.json",
  "artifacts/baseline.json",
  "package.json",
  "frozencore/circuit/statement.circom",
  "frozencore/artifacts/statement.wasm",
  "frozencore/artifacts/statement.r1cs",
  "frozencore/artifacts/statement.zkey",
  "frozencore/artifacts/manifest.json",
  "frozencore/setup/statement/pot_final.ptau",
  "frozencore/keys/statement_verification_key.json",
  "frozencore/PROVENANCE.md",
  "frozencore/artifacts/guest.r1cs",
  "frozencore/artifacts/guest.wasm",
  "frozencore/artifacts/guest.sym",
];

function log(message) {
  console.log(`[guest] ${message}`);
}

function buildLogger() {
  const emit = (level, args) => {
    const text = args.map((item) => (typeof item === "string" ? item : "[redacted]")).join(" ");
    if (/prvkey|secret|witness/i.test(text)) {
      console[level]("[guest] [redacted]");
      return;
    }
    console[level](`[guest] ${text}`);
  };
  return {
    info: (...args) => emit("log", args),
    log: (...args) => emit("log", args),
    debug() {},
    warn: (...args) => emit("warn", args),
    error: (...args) => emit("error", args),
  };
}

function requiredPower(nConstraints, nPubInputs, nOutputs) {
  const value = nConstraints + nPubInputs + nOutputs;
  return Math.floor(Math.log2(value)) + 1;
}

function snapshotProtected() {
  const snapshot = new Map();
  for (const rel of PROTECTED) {
    const filePath = path.join(root, rel);
    if (!fs.existsSync(filePath)) continue;
    snapshot.set(rel, sha256File(filePath));
  }
  return snapshot;
}

function assertProtected(snapshot) {
  for (const [rel, hash] of snapshot) {
    const filePath = path.join(root, rel);
    if (!fs.existsSync(filePath) || sha256File(filePath) !== hash) {
      throw new Error(`保全対象が変化しました: ${rel}`);
    }
  }
}

function runCircom(binary) {
  fs.mkdirSync(outDir, { recursive: true });
  const result = spawnSync(
    binary,
    [
      path.join(root, "frozencore", "circuit", "guest.circom"),
      "--r1cs",
      "--wasm",
      "--sym",
      "-l",
      path.join(root, "node_modules", "circomlib", "circuits"),
      "-o",
      outDir,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    throw new Error("guest 回路のコンパイルに失敗しました");
  }
  const generated = path.join(outDir, "guest_js", "guest.wasm");
  fs.copyFileSync(generated, path.join(outDir, "guest.wasm"));
}

async function main() {
  const protectedBefore = snapshotProtected();
  const circom = await ensureCircom();
  const circomVersion = spawnSync(circom, ["--version"], { encoding: "utf8" });
  log(`node ${process.version}`);
  log(`circom ${(circomVersion.stdout || circomVersion.stderr || "").trim()}`);
  log("出力先は frozencore/dev/guest だけです");
  runCircom(circom);

  const r1csPath = path.join(root, ARTIFACTS["guest.r1cs"]);
  const logger = buildLogger();
  const circuit = await snarkjs.r1cs.info(r1csPath, logger);
  if (circuit.nPubInputs !== 4 || circuit.nOutputs !== 0) {
    throw new Error("guest の公開入力が 4 ではありません");
  }
  if (circuit.nPrvInputs !== 3) {
    throw new Error(`guest の秘密入力が 3 ではありません: ${circuit.nPrvInputs}`);
  }
  const power = requiredPower(circuit.nConstraints, circuit.nPubInputs, circuit.nOutputs);
  if (power < 12 || power > 16) throw new Error(`powers of tau の power が想定外です: ${power}`);
  log(`constraints=${circuit.nConstraints} public=4 private=3 power=${power}`);

  const ptau0 = path.join(outDir, "pot_0000.ptau");
  const ptau1 = path.join(outDir, "pot_0001.ptau");
  const ptauFinal = path.join(outDir, "pot_final.ptau");
  const zkey0 = path.join(outDir, "guest_0000.zkey");
  const zkeyFinal = path.join(outDir, "guest.zkey");

  log("開発用の単一貢献者 ceremony を実行しています。本番用ではありません");
  const curve = await snarkjs.curves.getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, power, ptau0, logger);
  await snarkjs.powersOfTau.contribute(ptau0, ptau1, PHASE1_NAME, PHASE1_ENTROPY, logger);
  await snarkjs.powersOfTau.preparePhase2(ptau1, ptauFinal, logger);
  await snarkjs.zKey.newZKey(r1csPath, ptauFinal, zkey0, logger);
  await snarkjs.zKey.contribute(zkey0, zkeyFinal, PHASE2_NAME, PHASE2_ENTROPY, logger);
  const verified = await snarkjs.zKey.verifyFromR1cs(r1csPath, ptauFinal, zkeyFinal, logger);
  if (verified !== true) throw new Error("guest zkey の検証に失敗しました");

  const verificationKey = await snarkjs.zKey.exportVerificationKey(zkeyFinal, logger);
  if (verificationKey.nPublic !== 4 || verificationKey.IC.length !== 5) {
    throw new Error("書き出した guest 検証鍵の公開入力数が 4 ではありません");
  }
  const vkPath = path.join(root, ARTIFACTS["guest.vk"]);
  fs.writeFileSync(vkPath, `${JSON.stringify(verificationKey, null, 2)}\n`);
  fs.rmSync(ptau0, { force: true });
  fs.rmSync(ptau1, { force: true });
  fs.rmSync(zkey0, { force: true });

  const statementVk = path.join(root, ARTIFACTS["statement.vk"]);
  if (fs.existsSync(statementVk) && sha256File(statementVk) === sha256File(vkPath)) {
    throw new Error("guest の検証鍵が statement の検証鍵と一致しました");
  }

  const artifactNames = ["guest.wasm", "guest.r1cs", "guest.zkey", "guest.vk", "guest.ptau"];
  const artifacts = {};
  for (const name of artifactNames) artifacts[name] = sha256File(path.join(root, ARTIFACTS[name]));
  const manifest = {
    version: GUEST_VERSION,
    schema: GUEST_SCHEMA,
    production: false,
    proofSystem: { protocol: "groth16", curve: "bn254", snarkjsCurveName: "bn128" },
    circuit: {
      source: "frozencore/circuit/guest.circom",
      constraints: circuit.nConstraints,
      privateInputs: circuit.nPrvInputs,
      publicInputs: circuit.nPubInputs,
      publicSignals: [...GUEST_PUBLIC_SIGNALS],
      fixedProgram: [[1, 0], [2, 1], [3, 0], [3, 0]],
    },
    ceremony: {
      phase1Power: power,
      contributors: 1,
      production: false,
      toxicWastePersisted: false,
      ptauRetained: true,
      zkeyVerifiedFromR1cs: true,
      phase1Name: PHASE1_NAME,
      phase2Name: PHASE2_NAME,
      procedure: "node frozencore/scripts/build-guest.js",
      entropy: "public labels mixed with OS CSPRNG; re-running the script does not reproduce the same zkey bytes",
      note: "Single-contributor development setup for the fixed guest circuit. Not a multi-party ceremony. Not production. Toxic-waste destruction is not established. Statement keys were not used.",
    },
    toolchain: {
      node: process.version,
      circom: (circomVersion.stdout || circomVersion.stderr || "").trim(),
      snarkjs: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "snarkjs", "package.json"), "utf8")).version,
      circomlib: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "circomlib", "package.json"), "utf8")).version,
      circomlibjs: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "circomlibjs", "package.json"), "utf8")).version,
    },
    artifacts,
  };
  fs.writeFileSync(path.join(root, ARTIFACTS["guest.manifest"]), `${JSON.stringify(manifest, null, 2)}\n`);

  const { proveGuest } = await import("../src/guest-prove.js");
  const { verifyGuest } = await import("../src/guest-verify.js");
  const envelope = await proveGuest({ inputSecret: "8", inputSalt: "2", executionId: "42" });
  const ok = await verifyGuest(envelope);
  if (ok !== true) throw new Error("guest ビルド後の自己検証に失敗しました");
  if (envelope.publicSignals.length !== 4) throw new Error("自己検証の公開信号数が 4 ではありません");
  if (envelope.production !== false) throw new Error("自己検証が本番フラグになりました");
  log("self-check ok");
  for (const [name, hash] of Object.entries(artifacts)) log(`${name} ${hash}`);
  assertProtected(protectedBefore);
  log("statement、mini、未固定 guest 成果物は変化していません");
  process.exit(0);
}

main().catch((error) => {
  console.error("[guest] 失敗しました");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
