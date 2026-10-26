// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { sha256File } from "../../src/integrity/hash.js";
import { ensureCircom } from "../../scripts/ensure-circom.js";
import { ARTIFACTS, PROJECT_ROOT, PUBLIC_SIGNALS, SCHEMA, VERSION } from "../src/constants.js";
import { SAMPLE_PARTS } from "../src/sample.js";

const root = PROJECT_ROOT;
const setupDir = path.join(root, "frozencore", "setup", "statement");
const PHASE1_NAME = "frozencore-dev-phase1";
const PHASE2_NAME = "frozencore-dev-phase2";
const PHASE1_ENTROPY = "frozencore-phase1-dev-only-not-production";
const PHASE2_ENTROPY = "frozencore-phase2-dev-only-not-production";
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
];

function log(message) {
  console.log(`[frozencore] ${message}`);
}

function buildLogger() {
  const emit = (level, args) => {
    const text = args.map((item) => (typeof item === "string" ? item : "[redacted]")).join(" ");
    if (/prvkey|secret|witness/i.test(text)) {
      console[level]("[frozencore] [redacted]");
      return;
    }
    console[level](`[frozencore] ${text}`);
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
    if (!fs.existsSync(filePath)) throw new Error(`保全対象がありません: ${rel}`);
    snapshot.set(rel, sha256File(filePath));
  }
  return snapshot;
}

function assertProtected(snapshot) {
  for (const [rel, hash] of snapshot) {
    const actual = sha256File(path.join(root, rel));
    if (actual !== hash) throw new Error(`保全対象が変化しました: ${rel}`);
  }
}

function runCircom(binary) {
  const outDir = path.join(root, "frozencore", "artifacts");
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
    throw new Error("FrozenCore 回路のコンパイルに失敗しました");
  }
  const generated = path.join(outDir, "statement_js", "statement.wasm");
  fs.copyFileSync(generated, path.join(outDir, "statement.wasm"));
}

async function main() {
  throw new Error("既存の statement 成果物は上書きしません。programVersion を固定した開発用成果物は node frozencore/scripts/build-statement-dev.js が frozencore/dev/statement に作ります");
  const protectedBefore = snapshotProtected();
  const circom = await ensureCircom();
  const circomVersion = spawnSync(circom, ["--version"], { encoding: "utf8" });
  log(`node ${process.version}`);
  log(`circom ${(circomVersion.stdout || circomVersion.stderr || "").trim()}`);
  runCircom(circom);

  const r1csPath = path.join(root, ARTIFACTS["statement.r1cs"]);
  const logger = buildLogger();
  const circuit = await snarkjs.r1cs.info(r1csPath, logger);
  if (circuit.nPubInputs !== 30 || circuit.nPrvInputs !== 13 || circuit.nOutputs !== 0) {
    throw new Error("公開入力 30、非公開入力 13 ではありません");
  }
  const power = requiredPower(circuit.nConstraints, circuit.nPubInputs, circuit.nOutputs);
  if (power < 14 || power > 20) throw new Error(`powers of tau の power が想定外です: ${power}`);
  log(`constraints=${circuit.nConstraints} public=30 private=13 power=${power}`);

  fs.mkdirSync(setupDir, { recursive: true });
  const ptau0 = path.join(setupDir, "pot_0000.ptau");
  const ptau1 = path.join(setupDir, "pot_0001.ptau");
  const ptauFinal = path.join(setupDir, "pot_final.ptau");
  const zkey0 = path.join(setupDir, "statement_0000.zkey");
  const zkeyFinal = path.join(setupDir, "statement.zkey");

  log("開発用の単一貢献者 ceremony を実行しています");
  const curve = await snarkjs.curves.getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, power, ptau0, logger);
  await snarkjs.powersOfTau.contribute(ptau0, ptau1, PHASE1_NAME, PHASE1_ENTROPY, logger);
  await snarkjs.powersOfTau.preparePhase2(ptau1, ptauFinal, logger);
  await snarkjs.zKey.newZKey(r1csPath, ptauFinal, zkey0, logger);
  await snarkjs.zKey.contribute(zkey0, zkeyFinal, PHASE2_NAME, PHASE2_ENTROPY, logger);
  const verified = await snarkjs.zKey.verifyFromR1cs(r1csPath, ptauFinal, zkeyFinal, logger);
  if (verified !== true) throw new Error("zkey の検証に失敗しました");

  const verificationKey = await snarkjs.zKey.exportVerificationKey(zkeyFinal, logger);
  if (verificationKey.nPublic !== 30 || verificationKey.IC.length !== 31) {
    throw new Error("書き出した検証鍵の公開入力数が 30 ではありません");
  }
  fs.mkdirSync(path.join(root, "frozencore", "keys"), { recursive: true });
  const vkPath = path.join(root, ARTIFACTS["statement.vk"]);
  const zkeyPath = path.join(root, ARTIFACTS["statement.zkey"]);
  fs.writeFileSync(vkPath, `${JSON.stringify(verificationKey, null, 2)}\n`);
  fs.copyFileSync(zkeyFinal, zkeyPath);
  fs.rmSync(ptau0, { force: true });
  fs.rmSync(ptau1, { force: true });
  fs.rmSync(zkey0, { force: true });
  fs.rmSync(zkeyFinal, { force: true });

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
      entropy: "public labels mixed with OS CSPRNG; the entropy values are not a transcript",
      note: "Single-contributor development setup. Not a multi-party ceremony. Toxic-waste destruction is not established.",
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
  fs.writeFileSync(path.join(root, ARTIFACTS.manifest), `${JSON.stringify(manifest, null, 2)}\n`);

  const { prove } = await import("../src/prove.js");
  const { verify } = await import("../src/verify.js");
  const envelope = await prove(SAMPLE_PARTS);
  const ok = await verify(envelope);
  if (ok !== true) throw new Error("ビルド後の自己検証に失敗しました");
  if (envelope.publicSignals.length !== 30) throw new Error("自己検証の公開信号数が 30 ではありません");
  log("self-check ok");
  for (const [name, hash] of Object.entries(artifacts)) log(`${name} ${hash}`);

  const provenance = [
    "# FrozenCore ceremony record",
    "",
    "production: false",
    "contributors: 1",
    "multi-party ceremony: not performed",
    "toxic waste destruction: not established",
    `zkey verifyFromR1cs: ${verified === true}`,
    `power: ${power}`,
    `constraints: ${circuit.nConstraints}`,
    `node: ${process.version}`,
    `circom: ${(circomVersion.stdout || circomVersion.stderr || "").trim()}`,
    "",
    "SHA-256",
    "",
    ...Object.entries(artifacts).map(([name, hash]) => `${name} ${hash}`),
    "",
    "These artifacts belong to frozencore/circuit/statement.circom.",
    "They are not circuit/mini.zkey or keys/verification_key.json.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(root, "frozencore", "PROVENANCE.md"), provenance);
  assertProtected(protectedBefore);
  log("mini の保全対象は変化していません");
  process.exit(0);
}

main().catch((error) => {
  console.error("[frozencore] 失敗しました");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
