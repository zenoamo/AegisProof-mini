// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { ARTIFACTS, BASELINE_REL, BN254_SCALAR_FIELD, PROJECT_ROOT, PUBLIC_SIGNALS } from "../constants.js";
import { IntegrityError } from "../errors.js";
import { checkIntegrity } from "./check.js";

const silent = { info() {}, log() {}, debug() {}, warn() {}, error() {} };

function fail(message) {
  throw new IntegrityError(message);
}

function canonicalVerificationKey(vk) {
  return JSON.stringify({
    protocol: vk.protocol,
    curve: vk.curve,
    nPublic: vk.nPublic,
    vk_alpha_1: vk.vk_alpha_1,
    vk_beta_2: vk.vk_beta_2,
    vk_gamma_2: vk.vk_gamma_2,
    vk_delta_2: vk.vk_delta_2,
    vk_alphabeta_12: vk.vk_alphabeta_12,
    IC: vk.IC,
  });
}

function readVerificationKey(root) {
  let vk;
  try {
    vk = JSON.parse(fs.readFileSync(path.join(root, ARTIFACTS["verification_key.json"]), "utf8"));
  } catch {
    fail("verification_key.json を解釈できません");
  }
  if (!vk || vk.protocol !== "groth16" || vk.curve !== "bn128" || vk.nPublic !== 1) {
    fail("verification key が Groth16 / bn128 / nPublic=1 ではありません");
  }
  if (!Array.isArray(vk.IC) || vk.IC.length !== vk.nPublic + 1) {
    fail("verification key の IC 長が nPublic と一致しません");
  }
  return vk;
}

function assertBinding(manifest) {
  const binding = manifest.binding;
  if (binding === undefined) return;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    fail("manifest の binding が不正です");
  }
  if (binding.circuitSource !== "circuit/main.circom") fail("binding の回路パスが一致しません");
  if (binding.r1cs !== ARTIFACTS["circuit.r1cs"]) fail("binding の r1cs パスが一致しません");
  if (binding.zkey !== ARTIFACTS["circuit.zkey"]) fail("binding の zkey パスが一致しません");
  if (binding.verificationKey !== ARTIFACTS["verification_key.json"]) {
    fail("binding の verification key パスが一致しません");
  }
  if (binding.protocol !== "groth16" || binding.curve !== "bn254" || binding.snarkjsCurveName !== "bn128") {
    fail("binding の証明系が Groth16/BN254 ではありません");
  }
  if (binding.nPublic !== 1) fail("binding の nPublic が 1 ではありません");
}

function assertCircuitInfo(info, manifest) {
  if (!info || info.prime?.toString() !== BN254_SCALAR_FIELD.toString()) {
    fail("R1CS のスカラー体が BN254 ではありません");
  }
  if (info.nConstraints !== manifest.circuit?.constraints) fail("制約数が manifest と一致しません");
  if (info.nPrvInputs !== manifest.circuit?.privateInputs) fail("秘密入力の数が manifest と一致しません");
  if (info.nPubInputs !== manifest.circuit?.publicInputs) fail("公開入力の数が manifest と一致しません");
  if (info.nOutputs !== 0 || info.nPubInputs + info.nOutputs !== 1 || info.nPrvInputs !== 1) {
    fail("公開信号は 1 個、秘密信号は 1 個である必要があります");
  }
  if (!Array.isArray(manifest.circuit?.publicSignals) || manifest.circuit.publicSignals.length !== PUBLIC_SIGNALS.length) {
    fail("manifest の publicSignals が commitment 1 個ではありません");
  }
  if (manifest.circuit.publicSignals[0] !== PUBLIC_SIGNALS[0]) {
    fail("manifest の publicSignals が commitment ではありません");
  }
}

function assertBaseline(root, report) {
  const baselinePath = path.join(root, BASELINE_REL);
  if (!fs.existsSync(baselinePath)) fail("baseline.json が見つかりません");
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch {
    fail("baseline.json を解釈できません");
  }
  if (baseline.manifestSha256 !== report.manifestSha256) {
    fail("baseline の manifest.sha256 が現在の manifest と一致しません");
  }
  if (baseline.nPublic !== report.nPublic) fail("baseline の nPublic が一致しません");
  if (baseline.circuit?.constraints !== report.constraints) fail("baseline の制約数が一致しません");
  if (baseline.circuit?.privateInputs !== report.privateInputs) fail("baseline の秘密入力数が一致しません");
  if (baseline.circuit?.publicInputs !== report.publicInputs) fail("baseline の公開入力数が一致しません");
  if (baseline.circuit?.publicSignals?.[0] !== "commitment" || baseline.circuit.publicSignals.length !== 1) {
    fail("baseline の publicSignals が commitment 1 個ではありません");
  }
  if (baseline.proofSystem?.protocol !== "groth16" || baseline.proofSystem?.curve !== "bn254") {
    fail("baseline の証明系が Groth16/BN254 ではありません");
  }
  if (baseline.proofSystem?.snarkjsCurveName !== "bn128") fail("baseline の snarkjs 曲線名が bn128 ではありません");
  if (baseline.ceremony?.production !== false || baseline.ceremony?.contributors !== 1) {
    fail("baseline が single-contributor development ceremony の記録ではありません");
  }
  for (const name of Object.keys(ARTIFACTS)) {
    if (baseline.artifacts?.[name] !== report.artifacts[name]) {
      fail(`baseline の ${name} ハッシュが一致しません`);
    }
    if (baseline.files?.[name]?.bytes !== report.files[name].bytes) {
      fail(`baseline の ${name} サイズが一致しません`);
    }
  }
}

export async function checkKeyBinding(root = PROJECT_ROOT) {
  const integrity = await checkIntegrity(root);
  const manifest = integrity.manifest;
  assertBinding(manifest);
  if (!manifest.files) fail("manifest の files がありません");
  if (manifest.ceremony?.contributors !== 1) fail("manifest の contributors が 1 ではありません");

  const info = await snarkjs.r1cs.info(path.join(root, ARTIFACTS["circuit.r1cs"]), silent);
  assertCircuitInfo(info, manifest);

  const stored = readVerificationKey(root);
  const exported = await snarkjs.zKey.exportVerificationKey(path.join(root, ARTIFACTS["circuit.zkey"]), silent);
  if (canonicalVerificationKey(exported) !== canonicalVerificationKey(stored)) {
    fail("zkey から書き出した verification key が keys/verification_key.json と一致しません");
  }

  const report = {
    protocol: stored.protocol,
    curve: manifest.proofSystem.curve,
    snarkjsCurve: stored.curve,
    nPublic: stored.nPublic,
    constraints: info.nConstraints,
    privateInputs: info.nPrvInputs,
    publicInputs: info.nPubInputs,
    artifacts: integrity.artifacts,
    files: manifest.files,
    manifestSha256: integrity.manifestSha256,
    ceremony: {
      production: manifest.ceremony.production,
      contributors: manifest.ceremony.contributors,
    },
  };
  assertBaseline(root, report);
  return report;
}
