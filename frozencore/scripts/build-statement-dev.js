// SPDX-License-Identifier: GPL-3.0-or-later
// Development ceremony for the statement circuit after programVersion === 1.
// Writes only frozencore/dev/statement/. Does not replace legacy artifacts.
// Single contributor. production is false. zkey bytes are not reproducible.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { sha256File } from "../../src/integrity/hash.js";
import { ensureCircom } from "../../scripts/ensure-circom.js";
import { ARTIFACTS, PROJECT_ROOT, PUBLIC_SIGNALS, SCHEMA, VERSION } from "../src/constants.js";
import { SAMPLE_PARTS } from "../src/sample.js";

const root = PROJECT_ROOT;
const outDir = path.join(root, "frozencore", "dev", "statement");
const PHASE1_NAME = "frozencore-statement-v1-dev-phase1";
const PHASE2_NAME = "frozencore-statement-v1-dev-phase2";
const PHASE1_ENTROPY = "frozencore-statement-v1-phase1-dev-only-not-production";
const PHASE2_ENTROPY = "frozencore-statement-v1-phase2-dev-only-not-production";
const LEGACY = {
  r1cs: "frozencore/artifacts/statement.r1cs",
  wasm: "frozencore/artifacts/statement.wasm",
  zkey: "frozencore/artifacts/statement.zkey",
  ptau: "frozencore/setup/statement/pot_final.ptau",
  vk: "frozencore/keys/statement_verification_key.json",
  manifest: "frozencore/artifacts/manifest.json",
  sym: "frozencore/artifacts/statement.sym",
};
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
  "frozencore/circuit/guest.circom",
  "frozencore/PROVENANCE.md",
  "frozencore/dev/guest/guest.r1cs",
  "frozencore/dev/guest/guest.wasm",
  "frozencore/dev/guest/guest.zkey",
  "frozencore/dev/guest/verification_key.json",
  "frozencore/dev/guest/pot_final.ptau",
  "frozencore/dev/guest/manifest.json",
  ...Object.values(LEGACY),
];

function log(message) {
  console.log(`[statement-dev] ${message}`);
}

function buildLogger() {
  const emit = (level, args) => {
    const text = args.map((item) => (typeof item === "string" ? item : "[redacted]")).join(" ");
    if (/prvkey|secret|witness/i.test(text)) {
      console[level]("[statement-dev] [redacted]");
      return;
    }
    console[level](`[statement-dev] ${text}`);
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
  if (!snapshot.has(LEGACY.zkey) || !snapshot.has(LEGACY.r1cs)) {
    throw new Error("保全する既存 statement 成果物がありません");
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
      path.join(root, "frozencore", "circuit", "statement.circom"),
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
    throw new Error("statement 回路のコンパイルに失敗しました");
  }
  fs.copyFileSync(path.join(outDir, "statement_js", "statement.wasm"), path.join(outDir, "statement.wasm"));
}

async function legacyKeyRejectsNewR1cs(r1csPath, logger) {
  let verified = false;
  try {
    verified = await snarkjs.zKey.verifyFromR1cs(
      r1csPath,
      path.join(root, LEGACY.ptau),
      path.join(root, LEGACY.zkey),
      logger,
    );
  } catch {
    verified = false;
  }
  if (verified === true) {
    throw new Error("既存の statement zkey が新しい R1CS と一致してしまいました");
  }
  log("既存の statement zkey は新しい R1CS では検証できません");
}

async function main() {
  const protectedBefore = snapshotProtected();
  const circom = await ensureCircom();
  const circomVersion = spawnSync(circom, ["--version"], { encoding: "utf8" });
  log(`node ${process.version}`);
  log(`circom ${(circomVersion.stdout || circomVersion.stderr || "").trim()}`);
  log("出力先は frozencore/dev/statement だけです");
  runCircom(circom);

  const r1csPath = path.join(root, ARTIFACTS["statement.r1cs"]);
  if (path.resolve(r1csPath) !== path.resolve(outDir, "statement.r1cs")) {
    throw new Error("statement の ARTIFACTS が dev/statement を指していません");
  }
  const logger = buildLogger();
  const circuit = await snarkjs.r1cs.info(r1csPath, logger);
  if (circuit.nPubInputs !== 30 || circuit.nPrvInputs !== 13 || circuit.nOutputs !== 0) {
    throw new Error("公開入力 30、非公開入力 13 ではありません");
  }
  const power = requiredPower(circuit.nConstraints, circuit.nPubInputs, circuit.nOutputs);
  if (power !== 14) throw new Error(`powers of tau の power が 14 ではありません: ${power}`);
  log(`constraints=${circuit.nConstraints} public=30 private=13 power=${power}`);
  await legacyKeyRejectsNewR1cs(r1csPath, logger);

  const ptau0 = path.join(outDir, "pot_0000.ptau");
  const ptau1 = path.join(outDir, "pot_0001.ptau");
  const ptauFinal = path.join(outDir, "pot_final.ptau");
  const zkey0 = path.join(outDir, "statement_0000.zkey");
  const zkeyFinal = path.join(outDir, "statement.zkey");
  log("開発用の単一貢献者 ceremony を実行しています。本番用ではありません");
  const curve = await snarkjs.curves.getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, power, ptau0, logger);
  await snarkjs.powersOfTau.contribute(ptau0, ptau1, PHASE1_NAME, PHASE1_ENTROPY, logger);
  await snarkjs.powersOfTau.preparePhase2(ptau1, ptauFinal, logger);
  await snarkjs.zKey.newZKey(r1csPath, ptauFinal, zkey0, logger);
  await snarkjs.zKey.contribute(zkey0, zkeyFinal, PHASE2_NAME, PHASE2_ENTROPY, logger);
  const verified = await snarkjs.zKey.verifyFromR1cs(r1csPath, ptauFinal, zkeyFinal, logger);
  if (verified !== true) throw new Error("新しい statement zkey の検証に失敗しました");

  const verificationKey = await snarkjs.zKey.exportVerificationKey(zkeyFinal, logger);
  if (verificationKey.nPublic !== 30 || verificationKey.IC.length !== 31) {
    throw new Error("書き出した検証鍵の公開入力数が 30 ではありません");
  }
  const vkPath = path.join(root, ARTIFACTS["statement.vk"]);
  fs.writeFileSync(vkPath, `${JSON.stringify(verificationKey, null, 2)}\n`);
  fs.rmSync(ptau0, { force: true });
  fs.rmSync(ptau1, { force: true });
  fs.rmSync(zkey0, { force: true });
  if (sha256File(path.join(root, LEGACY.vk)) === sha256File(vkPath)) {
    throw new Error("新しい検証鍵が既存の statement 検証鍵と一致しました");
  }

  const artifactNames = ["statement.wasm", "statement.r1cs", "statement.zkey", "statement.vk", "statement.ptau"];
  const artifacts = {};
  for (const name of artifactNames) artifacts[name] = sha256File(path.join(root, ARTIFACTS[name]));
  const manifest = {
    version: VERSION,
    schema: SCHEMA,
    production: false,
    proofSystem: { protocol: "groth16", curve: "bn254", snarkjsCurveName: "bn128" },
    circuit: {
      source: "frozencore/circuit/statement.circom",
      constraints: circuit.nConstraints,
      privateInputs: circuit.nPrvInputs,
      publicInputs: circuit.nPubInputs,
      publicSignals: [...PUBLIC_SIGNALS],
      programVersionPinned: true,
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
      procedure: "node frozencore/scripts/build-statement-dev.js",
      entropy: "public labels mixed with OS CSPRNG; re-running the script does not reproduce the same zkey bytes",
      note: "Single-contributor development setup for programVersion === 1. Not production. Does not replace frozencore/artifacts/statement.zkey.",
    },
    toolchain: {
      node: process.version,
      circom: (circomVersion.stdout || circomVersion.stderr || "").trim(),
      snarkjs: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "snarkjs", "package.json"), "utf8")).version,
      circomlib: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "circomlib", "package.json"), "utf8")).version,
      circomlibjs: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "circomlibjs", "package.json"), "utf8")).version,
    },
    artifacts,
    legacyStatementKeyRejected: true,
  };
  fs.writeFileSync(path.join(root, ARTIFACTS.manifest), `${JSON.stringify(manifest, null, 2)}\n`);

  const { prove } = await import("../src/prove.js");
  const { verify } = await import("../src/verify.js");
  const envelope = await prove(SAMPLE_PARTS);
  if (await verify(envelope) !== true) throw new Error("ビルド後の自己検証に失敗しました");
  let legacyOk = false;
  try {
    const legacyVk = JSON.parse(fs.readFileSync(path.join(root, LEGACY.vk), "utf8"));
    legacyOk = await snarkjs.groth16.verify(legacyVk, envelope.publicSignals, envelope.proof);
  } catch {
    legacyOk = false;
  }
  if (legacyOk === true) throw new Error("既存の検証鍵が新しい証明を受理しました");
  try {
    await prove(SAMPLE_PARTS, { publicOverrides: { programVersion: "2" } });
    throw new Error("programVersion 2 の証明が生成されました");
  } catch (error) {
    if (error && error.message === "programVersion 2 の証明が生成されました") throw error;
  }
  log("self-check ok");
  for (const [name, hash] of Object.entries(artifacts)) log(`${name} ${hash}`);
  assertProtected(protectedBefore);
  log("既存の statement、guest、mini の成果物は変化していません");
  process.exit(0);
}

main().catch((error) => {
  console.error("[statement-dev] 失敗しました");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
