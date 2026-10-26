// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import * as snarkjs from "snarkjs";
import { sha256File } from "../../src/integrity/hash.js";
import { ARTIFACTS, PROJECT_ROOT, PUBLIC_SIGNALS, SCHEMA, VERSION } from "../src/constants.js";
import { activeHashesMatchManifest, assertVerifierRole } from "../src/keys.js";

function file(name) {
  return path.join(PROJECT_ROOT, ARTIFACTS[name]);
}

const manifest = JSON.parse(fs.readFileSync(file("manifest"), "utf8"));
if (manifest.production !== false || manifest.version !== VERSION || manifest.schema !== SCHEMA) {
  throw new Error("manifest の版が不正です");
}
if (manifest.ceremony?.contributors !== 1 || manifest.ceremony?.zkeyVerifiedFromR1cs !== true) {
  throw new Error("ceremony 記録が単一貢献者の検証済み開発用セットアップではありません");
}
if (manifest.circuit?.programVersionPinned !== true) {
  throw new Error("manifest が programVersion の回路固定を記録していません");
}
if (manifest.ceremony?.toxicWastePersisted !== false || manifest.circuit?.publicInputs !== 30) {
  throw new Error("ceremony 記録の主張が不正です");
}
for (const name of ["statement.wasm", "statement.r1cs", "statement.zkey", "statement.vk", "statement.ptau"]) {
  if (sha256File(file(name)) !== manifest.artifacts[name]) {
    throw new Error(`${name} のハッシュが manifest と一致しません`);
  }
}
const vk = JSON.parse(fs.readFileSync(file("statement.vk"), "utf8"));
const guestVkEarly = JSON.parse(fs.readFileSync(file("guest.vk"), "utf8"));
const [exported, guestExported] = await Promise.all([
  snarkjs.zKey.exportVerificationKey(file("statement.zkey")),
  snarkjs.zKey.exportVerificationKey(file("guest.zkey")),
]);
if (vk.nPublic !== 30 || exported.nPublic !== 30 || JSON.stringify(vk.IC) !== JSON.stringify(exported.IC)) {
  throw new Error("zkey から書き出した検証鍵が保存済みの鍵と一致しません");
}
if (JSON.stringify(manifest.circuit.publicSignals) !== JSON.stringify(PUBLIC_SIGNALS)) {
  throw new Error("manifest の公開信号順がスキーマと一致しません");
}
const legacyR1cs = path.join(PROJECT_ROOT, "frozencore/artifacts/statement.r1cs");
const legacyZkey = path.join(PROJECT_ROOT, "frozencore/artifacts/statement.zkey");
const legacyVk = path.join(PROJECT_ROOT, "frozencore/keys/statement_verification_key.json");
if (sha256File(legacyR1cs) === sha256File(file("statement.r1cs"))) {
  throw new Error("現行 statement r1cs が固定前の成果物と同一です");
}
if (sha256File(legacyZkey) === sha256File(file("statement.zkey"))) {
  throw new Error("現行 statement zkey が固定前の成果物と同一です");
}
if (sha256File(legacyVk) === sha256File(file("statement.vk"))) {
  throw new Error("現行 statement 検証鍵が固定前の成果物と同一です");
}
const guestManifest = JSON.parse(fs.readFileSync(file("guest.manifest"), "utf8"));
if (guestManifest.production !== false || guestManifest.ceremony?.production !== false || guestManifest.circuit?.publicInputs !== 4) {
  throw new Error("guest manifest が開発用の 4 公開入力セットアップではありません");
}
for (const name of ["guest.wasm", "guest.r1cs", "guest.zkey", "guest.vk", "guest.ptau"]) {
  if (sha256File(file(name)) !== guestManifest.artifacts[name]) {
    throw new Error(`${name} のハッシュが guest manifest と一致しません`);
  }
}
if (guestVkEarly.nPublic !== 4 || JSON.stringify(guestVkEarly.IC) !== JSON.stringify(guestExported.IC)) {
  throw new Error("guest の検証鍵が zkey と一致しません");
}
assertVerifierRole(vk, "statement");
assertVerifierRole(guestVkEarly, "guest");
activeHashesMatchManifest();
if (JSON.stringify(guestVkEarly.IC) === JSON.stringify(vk.IC)) throw new Error("guest と statement の検証鍵が同一です");
const [verified, legacyMatchesNewR1cs, guestVerified] = await Promise.all([
  snarkjs.zKey.verifyFromR1cs(file("statement.r1cs"), file("statement.ptau"), file("statement.zkey")),
  snarkjs.zKey.verifyFromR1cs(file("statement.r1cs"), path.join(PROJECT_ROOT, "frozencore/setup/statement/pot_final.ptau"), legacyZkey).catch(() => false),
  snarkjs.zKey.verifyFromR1cs(file("guest.r1cs"), file("guest.ptau"), file("guest.zkey")),
]);
if (verified !== true) throw new Error("ptau に対する zkey 検証に失敗しました");
if (legacyMatchesNewR1cs === true) throw new Error("固定前の zkey が新しい R1CS を検証できてしまいました");
if (guestVerified !== true) throw new Error("guest zkey の検証に失敗しました");
const legacyGuest = path.join(PROJECT_ROOT, "frozencore/artifacts/guest.r1cs");
if (fs.existsSync(legacyGuest) && sha256File(legacyGuest) === sha256File(file("guest.r1cs"))) {
  throw new Error("未固定の guest r1cs を現行成果物として使っています");
}
console.log("frozencore keys: ok");
console.log(`constraints ${manifest.circuit.constraints}`);
console.log(`zkey ${manifest.artifacts["statement.zkey"]}`);
console.log("ceremony single-contributor development. production=false. toxic waste destruction is not established");
process.exit(0);
