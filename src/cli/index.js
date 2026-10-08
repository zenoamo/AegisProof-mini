#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ARTIFACTS,
  MANIFEST_REL,
  MAX_INPUT_BYTES,
  MAX_PROOF_BYTES,
  ML_DSA_ALGORITHM,
  ML_DSA_CONTEXT,
  PROJECT_ROOT,
  VERSION,
} from "../constants.js";
import { AuthenticityError, InputError, IntegrityError, ProofError } from "../errors.js";
import { poseidonCommitment } from "../commitment.js";
import { parseFieldElement } from "../field.js";
import { checkIntegrity } from "../integrity/check.js";
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
  return `aegisproof-mini ${VERSION}

実験用の最小証明・検証・完全性ツールです。AegisProof v2 ではありません。

使い方:
  aegisproof-mini prove --input <file> --output <file>
  aegisproof-mini verify --proof <file>
  aegisproof-mini integrity
  aegisproof-mini test
  aegisproof-mini commit --secret <decimal>
  aegisproof-mini sign --public-key-out <file> --signature-out <file> [--secret-key-out <file>]
  aegisproof-mini authenticity --public-key <file> --signature <file>
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

function assertSafeOutput(file) {
  const resolved = path.resolve(file);
  const root = path.resolve(PROJECT_ROOT);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(prefix)) return;
  const rel = path.relative(root, resolved).split(path.sep).join("/");
  const normalized = process.platform === "win32" ? rel.toLowerCase() : rel;
  const blocked = new Set(
    [...PROTECTED].map((item) => (process.platform === "win32" ? item.toLowerCase() : item)),
  );
  if (blocked.has(normalized)) fail("保護された成果物パスへは出力できません", 4);
}

function samePath(left, right) {
  return path.resolve(left) === path.resolve(right);
}

async function commandProve(args) {
  const flags = options(args, {
    input: { type: "string" },
    output: { type: "string" },
  });
  if (!flags.input || !flags.output) fail(helpText(), 4);
  if (samePath(flags.input, flags.output)) fail("入力と出力に同じパスは使えません", 4);
  assertSafeOutput(flags.output);
  const input = readJson(flags.input, MAX_INPUT_BYTES, "入力JSONを解釈できません");
  try {
    await proveToFile(input, flags.output);
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    if (err instanceof InputError || err instanceof ProofError) fail(err.message, 3);
    fail("証明の生成に失敗しました", 3);
  }
  console.log(`証明を書きました: ${flags.output}`);
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

async function commandIntegrity(args) {
  if (args.length) fail(helpText(), 4);
  try {
    const result = await checkIntegrity();
    console.log("integrity: ok");
    for (const [name, hash] of Object.entries(result.artifacts)) {
      console.log(`${name} ${hash}`);
    }
    console.log(`manifest.sha256 ${result.manifestSha256}`);
  } catch (err) {
    if (err instanceof IntegrityError) fail(err.message, 2);
    fail("完全性検証に失敗しました", 2);
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
  integrity: commandIntegrity,
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
