#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ARTIFACTS,
  MANIFEST_REL,
  MANIFEST_SHA_REL,
  MAX_INPUT_BYTES,
  MAX_PROOF_BYTES,
  ML_DSA_ALGORITHM,
  ML_DSA_CONTEXT,
  PROJECT_ROOT,
  SCHEMA,
  VERSION,
} from "../constants.js";
import { AuthenticityError, InputError, IntegrityError, ProofError } from "../errors.js";
import { poseidonCommitment } from "../commitment.js";
import { parseFieldElement } from "../field.js";
import { checkIntegrity } from "../integrity/check.js";
import { checkArtifactBinding, checkKeyBinding } from "../integrity/keys.js";
import { proveToFile } from "../prover/prove.js";
import { verify } from "../verifier/verify.js";
import {
  digestArtifacts,
  fromHex,
  generateKeyPair,
  signDigest,
  toHex,
  verifyDigest,
} from "../authenticity/mldsa.js";
import { ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";

const PROTECTED = new Set([
  ...Object.values(ARTIFACTS),
  MANIFEST_REL,
  "artifacts/manifest.sha256",
  "circuit/main.circom",
]);

function helpText() {
  return `aegis ${VERSION}

実験用の最小証明・検証・完全性ツールです。AegisProof v2 ではありません。

使い方:
  aegis --help
  aegis --version
  aegis prove --input <file> [--output <file>]
  aegis verify --proof <file>
  aegis verify-artifacts
  aegis inspect
  aegis doctor

コマンド:
  prove             Groth16 proof の生成
  verify            proof の数学的検証
  verify-artifacts  Artifact の整合性検証
  inspect           Manifest・バージョン情報
  doctor            実行環境の診断

--output を省くと、作業ディレクトリへ proof.json を書きます。

同じ入口の追加コマンド:
  integrity
  key-info
  keys-check
  test
  commit --secret <decimal>
  sign --public-key-out <file> --signature-out <file> [--secret-key-out <file>]
  authenticity --public-key <file> --signature <file>
`;
}

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

function options(args, spec) {
  try {
    return parseArgs({ args, options: spec, strict: true }).values;
  } catch {
    fail(helpText(), 4);
  }
}

function readJson(file, maxBytes, invalidMessage) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    fail(invalidMessage, 4);
  }
  if (stat.size <= 0 || stat.size > maxBytes) fail(invalidMessage, 4);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    fail(invalidMessage, 4);
  }
}

function pathIdentity(file) {
  if (typeof file !== "string" || file.length === 0 || file.includes("\0")) {
    const error = new Error("protected output");
    error.code = "PROTECTED_OUTPUT";
    throw error;
  }
  const resolved = path.resolve(file);
  if (process.platform === "win32") {
    const withoutDrive = /^[a-zA-Z]:/.test(resolved) ? resolved.slice(2) : resolved;
    if (withoutDrive.includes(":")) {
      const error = new Error("protected output");
      error.code = "PROTECTED_OUTPUT";
      throw error;
    }
  }
  let cursor = resolved;
  const missing = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missing.push(path.basename(cursor));
    cursor = parent;
  }
  let real = cursor;
  try {
    real = fs.realpathSync.native(cursor);
  } catch {
    real = cursor;
  }
  for (let index = missing.length - 1; index >= 0; index -= 1) {
    real = path.join(real, missing[index]);
  }
  return process.platform === "win32" ? real.toLowerCase() : real;
}

function assertSafeOutput(file) {
  let target;
  try {
    target = pathIdentity(file);
  } catch (err) {
    if (err && err.code === "PROTECTED_OUTPUT") fail("保護された成果物パスへは出力できません", 4);
    throw err;
  }
  const blocked = [...PROTECTED].map((rel) => pathIdentity(path.join(PROJECT_ROOT, rel)));
  if (blocked.includes(target) || target === pathIdentity(PROJECT_ROOT)) {
    fail("保護された成果物パスへは出力できません", 4);
  }
}

function samePath(left, right) {
  try {
    return pathIdentity(left) === pathIdentity(right);
  } catch (err) {
    if (err && err.code === "PROTECTED_OUTPUT") fail("保護された成果物パスへは出力できません", 4);
    throw err;
  }
}

async function commandProve(args) {
  const flags = options(args, {
    input: { type: "string" },
    output: { type: "string" },
  });
  if (!flags.input) fail(helpText(), 4);
  const output = flags.output ?? path.resolve(process.cwd(), "proof.json");
  if (samePath(flags.input, output)) fail("入力と出力に同じパスは使えません", 4);
  assertSafeOutput(output);
  const input = readJson(flags.input, MAX_INPUT_BYTES, "入力JSONを解釈できません");
  try {
    await proveToFile(input, output);
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    if (err instanceof InputError || err instanceof ProofError) fail(err.message, 3);
    fail("証明の生成に失敗しました", 3);
  }
  console.log(`証明を書きました: ${output}`);
}

async function commandVerify(args) {
  const flags = options(args, { proof: { type: "string" } });
  if (!flags.proof) fail(helpText(), 4);
  const envelope = readJson(flags.proof, MAX_PROOF_BYTES, "証明JSONを解釈できません");
  try {
    const ok = await verify(envelope);
    if (ok !== true) fail("検証に失敗しました", 1);
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    fail("検証に失敗しました", 1);
  }
  console.log("検証に成功しました");
}

async function commandIntegrity(args, label = "integrity") {
  if (args.length) fail(helpText(), 4);
  try {
    const result = await checkIntegrity();
    console.log(`${label}: ok`);
    for (const [name, hash] of Object.entries(result.artifacts)) {
      console.log(`${name} ${hash}`);
    }
    console.log(`manifest.sha256 ${result.manifestSha256}`);
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    fail("完全性検証に失敗しました", 2);
  }
}

async function commandInspect(args) {
  if (args.length) fail(helpText(), 4);
  let result;
  try {
    result = await checkIntegrity();
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    fail("完全性検証に失敗しました", 2);
  }
  const manifest = result.manifest;
  const circuit = manifest.circuit || {};
  const proofSystem = manifest.proofSystem || {};
  const ceremony = manifest.ceremony || {};
  console.log(`version ${result.version}`);
  console.log(`schema ${SCHEMA}`);
  console.log(`protocol ${proofSystem.protocol ?? ""}`);
  console.log(`curve ${proofSystem.curve ?? ""}`);
  console.log(`snarkjsCurve ${proofSystem.snarkjsCurveName ?? ""}`);
  console.log(`constraints ${circuit.constraints ?? ""}`);
  console.log(`privateInputs ${circuit.privateInputs ?? ""}`);
  console.log(`publicInputs ${circuit.publicInputs ?? ""}`);
  console.log(`publicSignals ${Array.isArray(circuit.publicSignals) ? circuit.publicSignals.join(",") : ""}`);
  console.log(`nPublic ${manifest.binding?.nPublic ?? ""}`);
  console.log(`ceremony production=${ceremony.production} contributors=${ceremony.contributors}`);
  for (const [name, hash] of Object.entries(result.artifacts)) {
    console.log(`${name} ${hash}`);
  }
  console.log(`manifest.sha256 ${result.manifestSha256}`);
  const toolchain = manifest.toolchain || {};
  for (const key of ["node", "snarkjs", "circomlib", "circomlibjs"]) {
    if (toolchain[key]) console.log(`toolchain.${key} ${toolchain[key]}`);
  }
  if (circuit.circom) console.log(`toolchain.circom ${circuit.circom}`);
}

function readPackageManifest() {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
}

function installedVersion(name) {
  const pkgPath = path.join(PROJECT_ROOT, "node_modules", ...name.split("/"), "package.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function declaredVersion(pkg, name) {
  const declared = pkg.dependencies?.[name];
  return typeof declared === "string" ? declared : null;
}

function versionMatches(declared, actual) {
  if (!declared || !actual) return false;
  return declared.replace(/^[\^~]/, "") === actual;
}

function regularFile(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function circomStatus() {
  const child = spawnSync("circom", ["--version"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  if (child.error || child.status !== 0) return { present: false, detail: "" };
  const text = `${child.stdout || ""}\n${child.stderr || ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  return { present: true, detail: text || "" };
}

async function commandDoctor(args) {
  if (args.length) fail(helpText(), 4);
  const pkg = readPackageManifest();
  const checks = [];
  const report = (name, ok, detail = "") => {
    checks.push({ name, ok });
    console.log(`${name} ${ok ? "ok" : "fail"}${detail ? ` ${detail}` : ""}`);
  };

  const nodeRange = pkg.engines?.node || ">=20";
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const requiredMajor = Number(/^>=(\d+)/.exec(nodeRange)?.[1] ?? 20);
  report("node", Number.isInteger(nodeMajor) && nodeMajor >= requiredMajor, `${process.version} engines=${nodeRange}`);

  for (const name of ["snarkjs", "circomlib", "circomlibjs", "@noble/post-quantum"]) {
    const actual = installedVersion(name);
    const declared = declaredVersion(pkg, name);
    report(name, versionMatches(declared, actual), actual ?? "missing");
  }

  const requiredFiles = [...Object.values(ARTIFACTS), MANIFEST_REL, MANIFEST_SHA_REL];
  const missing = requiredFiles.filter((rel) => !regularFile(path.join(PROJECT_ROOT, rel)));
  report("artifacts", missing.length === 0, missing.join(","));

  let integrityOk = false;
  let integrityMessage = "完全性検証に失敗しました";
  try {
    await checkIntegrity();
    integrityOk = true;
    integrityMessage = "";
  } catch (err) {
    if (err instanceof IntegrityError && err.message) integrityMessage = err.message;
  }
  report("integrity", integrityOk);

  const circom = circomStatus();
  console.log(`circom ${circom.present ? "present" : "absent"}${circom.detail ? ` ${circom.detail}` : ""}`);

  if (checks.every((item) => item.ok)) {
    console.log("doctor: ok");
    return;
  }
  if (integrityMessage) console.error(integrityMessage);
  console.log("doctor: fail");
  process.exit(integrityOk ? 1 : 2);
}

function printKeyReport(report) {
  console.log(`protocol ${report.protocol}`);
  console.log(`curve ${report.curve}`);
  console.log(`snarkjsCurve ${report.snarkjsCurve}`);
  console.log(`nPublic ${report.nPublic}`);
  console.log(`constraints ${report.constraints}`);
  console.log(`privateInputs ${report.privateInputs}`);
  console.log(`publicInputs ${report.publicInputs}`);
  console.log(`r1csSha256 ${report.artifacts["circuit.r1cs"]}`);
  console.log(`zkeySha256 ${report.artifacts["circuit.zkey"]}`);
  console.log(`verificationKeySha256 ${report.artifacts["verification_key.json"]}`);
  console.log(`wasmSha256 ${report.artifacts["circuit.wasm"]}`);
  console.log(`manifestSha256 ${report.manifestSha256}`);
  console.log("ceremony single-contributor development. production=false");
  console.log("note setup entropy destruction is not established by this command");
}

async function commandKeyInfo(args) {
  if (args.length) fail(helpText(), 4);
  try {
    printKeyReport(await checkArtifactBinding());
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    fail("鍵情報の確認に失敗しました", 2);
  }
}

async function commandKeysCheck(args) {
  if (args.length) fail(helpText(), 4);
  try {
    const report = await checkKeyBinding();
    console.log("keys: ok");
    printKeyReport(report);
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    fail("鍵の対応確認に失敗しました", 2);
  }
}

function commandTest(args) {
  if (args.length) fail(helpText(), 4);
  const child = spawnSync(process.execPath, ["--test", "--test-force-exit", "tests/**/*.test.js"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

async function commandCommit(args) {
  const flags = options(args, { secret: { type: "string" } });
  if (!flags.secret) fail(helpText(), 4);
  console.error("警告: --secret はプロセス一覧から見えることがあります。実験用です。");
  let secret;
  try {
    secret = parseFieldElement(flags.secret, "secret");
  } catch (err) {
    if (err instanceof InputError) fail(err.message, 4);
    fail("commitment の計算に失敗しました", 4);
  }
  const commitment = await poseidonCommitment(secret);
  process.stdout.write(`${commitment}\n`);
}

function writeJson(file, value) {
  assertSafeOutput(file);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function commandSign(args) {
  const flags = options(args, {
    "public-key-out": { type: "string" },
    "signature-out": { type: "string" },
    "secret-key-out": { type: "string" },
  });
  if (!flags["public-key-out"] || !flags["signature-out"]) fail(helpText(), 4);
  let integrity;
  try {
    integrity = await checkIntegrity();
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    fail("完全性検証に失敗しました", 2);
  }
  const { secretKey, publicKey } = generateKeyPair();
  const digest = digestArtifacts(integrity.manifest.artifacts);
  let signature;
  try {
    signature = signDigest(secretKey, digest);
  } catch (err) {
    if (err instanceof AuthenticityError) fail(err.message, 5);
    fail("署名に失敗しました", 5);
  }
  writeJson(flags["public-key-out"], {
    algorithm: ML_DSA_ALGORITHM,
    context: ML_DSA_CONTEXT,
    publicKey: toHex(publicKey),
  });
  writeJson(flags["signature-out"], {
    algorithm: ML_DSA_ALGORITHM,
    context: ML_DSA_CONTEXT,
    digest: toHex(digest),
    signature: toHex(signature),
  });
  if (flags["secret-key-out"]) {
    writeJson(flags["secret-key-out"], {
      algorithm: ML_DSA_ALGORITHM,
      secretKey: toHex(secretKey),
    });
    console.error(`警告: 秘密鍵を書きました。コミットしないでください: ${flags["secret-key-out"]}`);
  }
  console.log(`公開鍵を書きました: ${flags["public-key-out"]}`);
  console.log(`署名を書きました: ${flags["signature-out"]}`);
}

async function commandAuthenticity(args) {
  const flags = options(args, {
    "public-key": { type: "string" },
    signature: { type: "string" },
  });
  if (!flags["public-key"] || !flags.signature) fail(helpText(), 4);
  let integrity;
  try {
    integrity = await checkIntegrity();
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    fail("完全性検証に失敗しました", 2);
  }
  const publicKeyFile = readJson(flags["public-key"], MAX_INPUT_BYTES, "公開鍵JSONを解釈できません");
  const signatureFile = readJson(flags.signature, MAX_PROOF_BYTES, "署名JSONを解釈できません");
  if (publicKeyFile.algorithm !== ML_DSA_ALGORITHM || signatureFile.algorithm !== ML_DSA_ALGORITHM) {
    fail("ML-DSA-87 以外の鍵または署名です", 5);
  }
  if (publicKeyFile.context !== ML_DSA_CONTEXT || signatureFile.context !== ML_DSA_CONTEXT) {
    fail("署名コンテキストが一致しません", 5);
  }
  let ok = false;
  try {
    const digest = digestArtifacts(integrity.manifest.artifacts);
    const publicKey = fromHex(publicKeyFile.publicKey, ml_dsa87.lengths.publicKey);
    const signature = fromHex(signatureFile.signature, ml_dsa87.lengths.signature);
    if (signatureFile.digest !== toHex(digest)) ok = false;
    else ok = verifyDigest(publicKey, signature, digest);
  } catch (err) {
    if (err instanceof AuthenticityError) fail("真正性検証に失敗しました", 5);
    ok = false;
  }
  if (ok !== true) fail("真正性検証に失敗しました", 5);
  console.log("authenticity: ok");
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "help" || command === "--help" || command === "-h") {
  process.stdout.write(helpText());
  process.exit(command ? 0 : 4);
}

if (command === "--version" || command === "version") {
  console.log(VERSION);
  process.exit(0);
}

const commands = {
  prove: commandProve,
  verify: commandVerify,
  "verify-artifacts": (args) => commandIntegrity(args, "verify-artifacts"),
  inspect: commandInspect,
  doctor: commandDoctor,
  integrity: commandIntegrity,
  "key-info": commandKeyInfo,
  "keys-check": commandKeysCheck,
  test: commandTest,
  commit: commandCommit,
  sign: commandSign,
  authenticity: commandAuthenticity,
};

const handler = commands[command];
if (!handler) fail(helpText(), 4);

Promise.resolve()
  .then(() => handler(rest))
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
