// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { ARTIFACTS, BN254_SCALAR_FIELD, VERSION } from "../src/constants.js";
import { checkIntegrity } from "../src/integrity/check.js";
import { sha256File } from "../src/integrity/hash.js";
import { writeManifest } from "../src/integrity/manifest.js";
import { ensureCircom } from "./ensure-circom.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const setupDir = path.join(root, "build", "setup");
const PHASE1_NAME = "aegisproof-mini-dev-phase1";
const PHASE2_NAME = "aegisproof-mini-dev-phase2";
// Public labels only. snarkjs mixes these with OS CSPRNG bytes and does not persist the toxic waste.
const PHASE1_ENTROPY = "aegisproof-mini-phase1-dev-only-not-production";
const PHASE2_ENTROPY = "aegisproof-mini-phase2-dev-only-not-production";

function log(message) {
  console.log(`[build] ${message}`);
}

function buildLogger() {
  const emit = (level, args) => {
    const text = args.map((item) => (typeof item === "string" ? item : "[redacted]")).join(" ");
    if (/prvkey|secret|witness/i.test(text)) {
      console[level]("[build] [redacted]");
      return;
    }
    console[level](`[build] ${text}`);
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
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("回路サイズを判定できません");
  }
  return Math.floor(Math.log2(value)) + 1;
}

function runCircom(binary) {
  const result = spawnSync(
    binary,
    [
      path.join(root, "circuit", "main.circom"),
      "--r1cs",
      "--wasm",
      "--sym",
      "-l",
      path.join(root, "node_modules", "circomlib", "circuits"),
      "-o",
      path.join(root, "circuit"),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    throw new Error("circom のコンパイルに失敗しました");
  }
}

function placeWasm() {
  const generated = path.join(root, "circuit", "main_js", "main.wasm");
  const target = path.join(root, ARTIFACTS["circuit.wasm"]);
  if (!fs.existsSync(generated)) throw new Error("circom が wasm を出力しませんでした");
  fs.copyFileSync(generated, target);
  fs.rmSync(path.join(root, "circuit", "main_js"), { recursive: true, force: true });
}

async function main() {
  if (path.basename(ARTIFACTS["circuit.zkey"]) !== "mini.zkey") {
    throw new Error("zkey の出力名は mini.zkey です");
  }
  const circom = await ensureCircom();
  const circomVersion = spawnSync(circom, ["--version"], { encoding: "utf8" });
  log(`node ${process.version}`);
  log(`circom ${(circomVersion.stdout || circomVersion.stderr || "").trim()} (${circom})`);
  log(`snarkjs ${JSON.parse(fs.readFileSync(path.join(root, "node_modules", "snarkjs", "package.json"), "utf8")).version}`);
  log("circuit をコンパイルしています");
  runCircom(circom);
  placeWasm();

  const r1csPath = path.join(root, ARTIFACTS["circuit.r1cs"]);
  const circuit = await snarkjs.r1cs.info(r1csPath, buildLogger());
  const prime = circuit.prime.toString();
  if (prime !== BN254_SCALAR_FIELD.toString()) {
    throw new Error("回路のスカラー体が BN254 ではありません");
  }
  if (circuit.nPrvInputs !== 1 || circuit.nPubInputs + circuit.nOutputs !== 1) {
    throw new Error("公開信号は commitment 1 個、秘密信号は secret 1 個である必要があります");
  }
  const power = requiredPower(circuit.nConstraints, circuit.nPubInputs, circuit.nOutputs);
  if (power < 1 || power > 28) throw new Error(`powers of tau の power が範囲外です: ${power}`);
  log(`constraints=${circuit.nConstraints} public=${circuit.nPubInputs} private=${circuit.nPrvInputs} power=${power}`);

  fs.rmSync(setupDir, { recursive: true, force: true });
  fs.mkdirSync(setupDir, { recursive: true });
  const ptau0 = path.join(setupDir, "pot_0000.ptau");
  const ptau1 = path.join(setupDir, "pot_0001.ptau");
  const ptauFinal = path.join(setupDir, "pot_final.ptau");
  const zkey0 = path.join(setupDir, "mini_0000.zkey");
  const zkeyFinal = path.join(setupDir, "mini.zkey");
  const logger = buildLogger();

  log("開発用の単一貢献者 ceremony を実行しています");
  const curve = await snarkjs.curves.getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, power, ptau0, logger);
  await snarkjs.powersOfTau.contribute(ptau0, ptau1, PHASE1_NAME, PHASE1_ENTROPY, logger);
  await snarkjs.powersOfTau.preparePhase2(ptau1, ptauFinal, logger);
  await snarkjs.zKey.newZKey(r1csPath, ptauFinal, zkey0, logger);
  await snarkjs.zKey.contribute(zkey0, zkeyFinal, PHASE2_NAME, PHASE2_ENTROPY, logger);
  // snarkjs zkey verify needs the powers-of-tau file. It is still on disk here, and is deleted below.
  const verified = await snarkjs.zKey.verifyFromR1cs(r1csPath, ptauFinal, zkeyFinal, logger);
  if (verified !== true) throw new Error("zkey の検証に失敗しました");

  const verificationKey = await snarkjs.zKey.exportVerificationKey(zkeyFinal, logger);
  fs.mkdirSync(path.join(root, "keys"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ARTIFACTS["verification_key.json"]),
    `${JSON.stringify(verificationKey, null, 2)}\n`,
  );
  fs.copyFileSync(zkeyFinal, path.join(root, ARTIFACTS["circuit.zkey"]));

  const artifacts = {};
  for (const [name, rel] of Object.entries(ARTIFACTS)) {
    artifacts[name] = sha256File(path.join(root, rel));
  }
  const manifest = {
    version: VERSION,
    proofSystem: {
      protocol: "groth16",
      curve: "bn254",
      snarkjsCurveName: "bn128",
    },
    circuit: {
      name: "commitment",
      hash: "poseidon",
      publicSignals: ["commitment"],
      constraints: circuit.nConstraints,
      privateInputs: circuit.nPrvInputs,
      publicInputs: circuit.nPubInputs,
      circom: "2.2.3",
    },
    ceremony: {
      phase1Power: power,
      contributors: 1,
      production: false,
      toxicWastePersisted: false,
      note: "Development-only single-party Groth16 setup. Not AegisProof v2 production.zkey.",
    },
    toolchain: {
      node: process.version,
      snarkjs: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "snarkjs", "package.json"), "utf8")).version,
      circomlib: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "circomlib", "package.json"), "utf8")).version,
      circomlibjs: JSON.parse(fs.readFileSync(path.join(root, "node_modules", "circomlibjs", "package.json"), "utf8")).version,
    },
    artifacts,
  };
  const files = {};
  for (const [name, rel] of Object.entries(ARTIFACTS)) {
    const filePath = path.join(root, rel);
    files[name] = {
      path: rel,
      sha256: artifacts[name],
      bytes: fs.statSync(filePath).size,
    };
  }
  manifest.files = files;
  manifest.binding = {
    circuitSource: "circuit/main.circom",
    r1cs: ARTIFACTS["circuit.r1cs"],
    zkey: ARTIFACTS["circuit.zkey"],
    verificationKey: ARTIFACTS["verification_key.json"],
    protocol: "groth16",
    curve: "bn254",
    snarkjsCurveName: "bn128",
    nPublic: 1,
  };
  writeManifest(root, manifest);
  fs.rmSync(setupDir, { recursive: true, force: true });
  log("artifacts/baseline.json は更新していません。鍵を差し替えるときは baseline を同じ commit で明示的に更新してください");

  const integrity = await checkIntegrity(root);
  log("manifest と成果物の SHA-256 が一致しました");
  for (const [name, hash] of Object.entries(integrity.artifacts)) {
    log(`${name} ${hash}`);
  }
  log(`manifest.sha256 ${integrity.manifestSha256}`);

  const { poseidonCommitment } = await import("../src/commitment.js");
  const { prove } = await import("../src/prover/prove.js");
  const { verify } = await import("../src/verifier/verify.js");
  const commitment = await poseidonCommitment(4n);
  const envelope = await prove({ secret: "4", commitment });
  const ok = await verify(envelope);
  if (ok !== true) throw new Error("ビルド後の自己検証に失敗しました");
  log(`self-check ok constraints=${circuit.nConstraints}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[build] 失敗しました");
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
