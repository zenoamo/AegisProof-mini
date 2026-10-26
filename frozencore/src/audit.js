// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
  PUBLIC_SIGNALS,
  SCHEMA,
  VERSION,
} from "./constants.js";
import {
  LEGACY_GUEST_R1CS,
  LEGACY_STATEMENT_R1CS,
  LEGACY_STATEMENT_VK,
  LEGACY_STATEMENT_ZKEY,
} from "./keys.js";

const silentLogger = {
  info() {},
  log() {},
  debug() {},
  warn() {},
  error() {},
};

function rel(root, file) {
  return path.resolve(root, file);
}

function escapesRoot(root, file) {
  const resolved = path.resolve(root, file);
  const relative = path.relative(path.resolve(root), resolved);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

function inspectFile(filePath, lstat) {
  try {
    const stat = lstat(filePath);
    if (stat.isSymbolicLink()) return { kind: "symlink", sha256: null };
    if (!stat.isFile()) return { kind: "absent", sha256: null };
    return { kind: "file", sha256: sha256File(filePath) };
  } catch {
    return { kind: "absent", sha256: null };
  }
}

function publicNames(symPath, count) {
  const lines = fs.readFileSync(symPath, "utf8").split(/\r?\n/).filter((line) => line.length > 0);
  return lines.slice(0, count).map((line) => line.split(",").at(-1).replace(/^main\./, ""));
}

export function defaultRoles() {
  return [
    {
      id: "guest",
      source: "frozencore/circuit/guest.circom",
      schema: GUEST_SCHEMA,
      version: GUEST_VERSION,
      publicSignals: [...GUEST_PUBLIC_SIGNALS],
      expectedPublicInputs: 4,
      manifest: ARTIFACTS["guest.manifest"],
      sym: "frozencore/dev/guest/guest.sym",
      files: {
        wasm: ARTIFACTS["guest.wasm"],
        r1cs: ARTIFACTS["guest.r1cs"],
        ptau: ARTIFACTS["guest.ptau"],
        zkey: ARTIFACTS["guest.zkey"],
        vk: ARTIFACTS["guest.vk"],
      },
      legacy: [LEGACY_GUEST_R1CS, "frozencore/artifacts/guest.wasm", "frozencore/artifacts/guest.sym"],
      programVersionPinned: false,
    },
    {
      id: "statement",
      source: "frozencore/circuit/statement.circom",
      schema: SCHEMA,
      version: VERSION,
      publicSignals: [...PUBLIC_SIGNALS],
      expectedPublicInputs: 30,
      manifest: ARTIFACTS.manifest,
      sym: "frozencore/dev/statement/statement.sym",
      files: {
        wasm: ARTIFACTS["statement.wasm"],
        r1cs: ARTIFACTS["statement.r1cs"],
        ptau: ARTIFACTS["statement.ptau"],
        zkey: ARTIFACTS["statement.zkey"],
        vk: ARTIFACTS["statement.vk"],
      },
      legacy: [
        LEGACY_STATEMENT_R1CS,
        LEGACY_STATEMENT_ZKEY,
        LEGACY_STATEMENT_VK,
        "frozencore/artifacts/statement.wasm",
        "frozencore/setup/statement/pot_final.ptau",
      ],
      programVersionPinned: true,
    },
  ];
}

function failure(failures, code, role, detail) {
  failures.push({ code, role, detail });
}

function requireSnark(library, failures) {
  if (!library?.r1cs?.info || !library?.zKey?.verifyFromR1cs || !library?.zKey?.exportVerificationKey) {
    failure(failures, "tool-missing", null, "snarkjs r1cs.info, zKey.verifyFromR1cs, zKey.exportVerificationKey");
    return false;
  }
  return true;
}

function readManifest(manifestPath, role, failures) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    failure(failures, "manifest-invalid", role.id, "json");
    return null;
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    failure(failures, "manifest-invalid", role.id, "type");
    return null;
  }
  if (manifest.production !== false || manifest.ceremony?.production === true) {
    failure(failures, "development-key-marked-production", role.id, role.manifest);
  }
  if (typeof manifest.schema !== "string" || manifest.schema !== role.schema) {
    failure(failures, "schema-mismatch", role.id, String(manifest.schema));
  }
  if (typeof manifest.circuit?.source !== "string" || manifest.circuit.source !== role.source) {
    failure(failures, "manifest-path-mismatch", role.id, "circuit.source");
  }
  if (typeof manifest.circuit?.constraints !== "number" || !Number.isInteger(manifest.circuit.constraints)) {
    failure(failures, "manifest-invalid", role.id, "circuit.constraints");
  }
  if (typeof manifest.circuit?.publicInputs !== "number" || manifest.circuit.publicInputs !== role.expectedPublicInputs) {
    failure(failures, "manifest-invalid", role.id, "circuit.publicInputs");
  }
  if (!Array.isArray(manifest.circuit?.publicSignals) || manifest.circuit.publicSignals.join(",") !== role.publicSignals.join(",")) {
    failure(failures, "manifest-invalid", role.id, "circuit.publicSignals");
  }
  if (role.programVersionPinned && manifest.circuit?.programVersionPinned !== true) {
    failure(failures, "program-version-not-pinned", role.id, role.manifest);
  }
  if (!manifest.artifacts || typeof manifest.artifacts !== "object" || Array.isArray(manifest.artifacts)) {
    failure(failures, "manifest-invalid", role.id, "artifacts");
  }
  return manifest;
}

async function auditRole(role, root, library, failures, options) {
  const lstat = options.lstat ?? fs.lstatSync;
  const sourcePath = rel(root, role.source);
  const record = {
    id: role.id,
    production: false,
    development: true,
    source: { path: role.source, present: fs.existsSync(sourcePath), sha256: null },
    schema: { id: role.schema, version: role.version, publicSignals: role.publicSignals },
    files: {},
    circuit: null,
    cryptographic: {
      performed: false,
      verifyFromR1cs: null,
      verificationKeyMatchesExport: null,
      zkeyByteEqualityRequired: false,
    },
    command: role.id === "guest"
      ? "node frozencore/scripts/build-guest.js"
      : "node frozencore/scripts/build-statement-dev.js",
  };
  if (options.confineToRoot === true && escapesRoot(root, role.source)) {
    record.source.present = false;
    failure(failures, "path-escape", role.id, role.source);
    return record;
  }
  const sourceStat = inspectFile(sourcePath, lstat);
  if (sourceStat.kind === "symlink") {
    record.source.present = false;
    failure(failures, "symlink-rejected", role.id, role.source);
    return record;
  }
  if (sourceStat.kind !== "file") {
    failure(failures, "missing-source", role.id, role.source);
    return record;
  }
  record.source.present = true;
  record.source.sha256 = sourceStat.sha256;

  let manifest = null;
  const manifestPath = rel(root, role.manifest);
  if (options.confineToRoot === true && escapesRoot(root, role.manifest)) {
    failure(failures, "path-escape", role.id, role.manifest);
  } else if (inspectFile(manifestPath, lstat).kind === "symlink") {
    failure(failures, "symlink-rejected", role.id, role.manifest);
  } else if (inspectFile(manifestPath, lstat).kind !== "file") {
    failure(failures, "missing-manifest", role.id, role.manifest);
  } else {
    manifest = readManifest(manifestPath, role, failures);
    if (manifest) {
      record.toolchain = {
        node: manifest.toolchain?.node ?? null,
        circom: manifest.toolchain?.circom ?? null,
        snarkjs: manifest.toolchain?.snarkjs ?? null,
      };
      record.constraintsClaim = manifest.circuit?.constraints ?? null;
      record.publicInputsClaim = manifest.circuit?.publicInputs ?? null;
    }
  }

  const hashes = {};
  for (const [name, relPath] of Object.entries(role.files)) {
    if (options.confineToRoot === true && escapesRoot(root, relPath)) {
      failure(failures, "path-escape", role.id, relPath);
      record.files[name] = { path: relPath, present: false, sha256: null };
      hashes[name] = null;
      continue;
    }
    const inspected = inspectFile(rel(root, relPath), lstat);
    if (inspected.kind === "symlink") {
      failure(failures, "symlink-rejected", role.id, relPath);
      record.files[name] = { path: relPath, present: false, sha256: null, symlink: true };
      hashes[name] = null;
      continue;
    }
    const present = inspected.kind === "file";
    record.files[name] = { path: relPath, present, sha256: inspected.sha256 };
    hashes[name] = inspected.sha256;
    if (!present) failure(failures, "missing-artifact", role.id, relPath);
  }
  if (manifest?.artifacts && typeof manifest.artifacts === "object" && !Array.isArray(manifest.artifacts)) {
    for (const name of ["wasm", "r1cs", "ptau", "zkey", "vk"]) {
      const claimed = manifest.artifacts[`${role.id}.${name}`];
      if (typeof claimed !== "string") {
        failure(failures, "manifest-invalid", role.id, name);
        continue;
      }
      if (!record.files[name]) continue;
      record.files[name].manifestSha256 = claimed;
      if (!hashes[name]) continue;
      record.files[name].hashMatch = hashes[name] === claimed;
      if (hashes[name] !== claimed) failure(failures, "manifest-hash-mismatch", role.id, name);
    }
  }

  for (const legacyRel of role.legacy) {
    const legacyPath = rel(root, legacyRel);
    if (!fs.existsSync(legacyPath)) continue;
    const legacyHash = sha256File(legacyPath);
    for (const [name, sha256] of Object.entries(hashes)) {
      if (sha256 && sha256 === legacyHash) failure(failures, "legacy-artifact", role.id, `${name} matches ${legacyRel}`);
    }
  }

  const r1csPath = rel(root, role.files.r1cs);
  const vkPath = rel(root, role.files.vk);
  const zkeyPath = rel(root, role.files.zkey);
  const ptauPath = rel(root, role.files.ptau);
  if (!hashes.r1cs || !hashes.vk || !hashes.zkey || !hashes.ptau) return record;

  let info;
  try {
    info = await library.r1cs.info(r1csPath, silentLogger);
  } catch {
    failure(failures, "audit-exception", role.id, "r1cs.info");
    record.cryptographic.skipped = "structural-failure";
    return record;
  }
  record.circuit = {
    constraints: info.nConstraints,
    publicInputs: info.nPubInputs,
    privateInputs: info.nPrvInputs,
    outputs: info.nOutputs,
  };
  if (info.nPubInputs !== role.expectedPublicInputs) {
    failure(failures, "public-input-count", role.id, String(info.nPubInputs));
  }
  if (manifest?.circuit && info.nConstraints !== manifest.circuit.constraints) {
    failure(failures, "constraint-count", role.id, `${info.nConstraints}!=${manifest.circuit.constraints}`);
  }
  if (manifest?.circuit && info.nPubInputs !== manifest.circuit.publicInputs) {
    failure(failures, "public-input-count", role.id, "manifest");
  }

  let vk;
  try {
    vk = JSON.parse(fs.readFileSync(vkPath, "utf8"));
    if (!vk || typeof vk !== "object" || Array.isArray(vk)) throw new Error("verification key");
  } catch {
    failure(failures, "verification-key-unreadable", role.id, role.files.vk);
    record.cryptographic.skipped = "structural-failure";
    return record;
  }
  record.verificationKey = { nPublic: vk.nPublic ?? null, protocol: vk.protocol ?? null, curve: vk.curve ?? null };
  if (vk.nPublic !== role.expectedPublicInputs || vk.IC?.length !== role.expectedPublicInputs + 1) {
    failure(failures, "public-input-count", role.id, "verification-key");
  }
  if (vk.protocol !== "groth16" || vk.curve !== "bn128") {
    failure(failures, "verification-key-protocol", role.id, `${vk.protocol}/${vk.curve}`);
  }

  const symPath = rel(root, role.sym);
  if (options.confineToRoot === true && escapesRoot(root, role.sym)) {
    failure(failures, "path-escape", role.id, role.sym);
  } else {
    const symFile = inspectFile(symPath, lstat);
    if (symFile.kind === "symlink") failure(failures, "symlink-rejected", role.id, role.sym);
    else if (symFile.kind !== "file") failure(failures, "missing-artifact", role.id, role.sym);
    else {
      try {
        const names = publicNames(symPath, role.expectedPublicInputs);
        record.signalOrder = names;
        if (names.join(",") !== role.publicSignals.join(",")) {
          failure(failures, "signal-order", role.id, names.join(","));
        }
      } catch {
        failure(failures, "audit-exception", role.id, "sym");
      }
    }
  }

  if (failures.some((item) => item.role === role.id)) {
    record.cryptographic.skipped = "structural-failure";
    return record;
  }

  // Hash equality is not this check. nPublic and IC compare the exported key
  // with the verification-key file. verifyFromR1cs is recorded separately.
  let exported = null;
  let exportFailed = false;
  try {
    exported = await library.zKey.exportVerificationKey(zkeyPath, silentLogger);
  } catch {
    exportFailed = true;
    failure(failures, "verification-key-export-failed", role.id, "threw");
  }
  if (!exportFailed) {
    const nPublicOk = exported?.nPublic === vk.nPublic && exported?.nPublic === role.expectedPublicInputs;
    const icOk = Array.isArray(exported?.IC)
      && exported.IC.length === role.expectedPublicInputs + 1
      && JSON.stringify(exported.IC) === JSON.stringify(vk.IC);
    record.cryptographic.verificationKeyMatchesExport = nPublicOk === true && icOk === true;
    if (!nPublicOk) failure(failures, "verification-key-mismatch", role.id, "nPublic");
    else if (!icOk) failure(failures, "verification-key-mismatch", role.id, "IC");
  }

  try {
    const verified = await library.zKey.verifyFromR1cs(r1csPath, ptauPath, zkeyPath, silentLogger);
    record.cryptographic.performed = true;
    record.cryptographic.verifyFromR1cs = verified === true;
    if (verified !== true) failure(failures, "cryptographic-verification-failed", role.id, "verifyFromR1cs");
  } catch {
    record.cryptographic.performed = true;
    record.cryptographic.verifyFromR1cs = false;
    failure(failures, "cryptographic-verification-failed", role.id, "threw");
  }
  return record;
}

export async function auditArtifacts(options = {}) {
  const root = options.root ?? PROJECT_ROOT;
  const library = options.snarkjs === undefined ? snarkjs : options.snarkjs;
  const failures = [];
  if (options.mode === "production") {
    failure(failures, "development-keys-in-production-mode", null, "development keys are not production keys");
    return {
      ok: false,
      production: false,
      mode: "production",
      fallback: false,
      failures,
      roles: {},
      toolchain: { node: process.version, snarkjs: null, circom: null },
    };
  }
  if (!requireSnark(library, failures)) {
    return {
      ok: false,
      production: false,
      mode: "development",
      fallback: false,
      failures,
      roles: {},
      toolchain: { node: process.version, snarkjs: null, circom: null },
    };
  }
  const roles = options.roles ?? defaultRoles();
  const reports = [];
  for (const role of roles) {
    try {
      reports.push(await auditRole(role, root, library, failures, options));
    } catch {
      failure(failures, "audit-exception", role.id, "uncaught");
      reports.push({
        id: role.id,
        production: false,
        development: true,
        cryptographic: { performed: false, verifyFromR1cs: false, verificationKeyMatchesExport: false },
      });
    }
  }
  if (reports.length >= 2) {
    const [left, right] = reports;
    if (left.files?.zkey?.sha256 && left.files.zkey.sha256 === right.files?.zkey?.sha256) {
      failure(failures, "key-confusion", null, "zkey");
    }
    if (left.files?.vk?.sha256 && left.files.vk.sha256 === right.files?.vk?.sha256) {
      failure(failures, "key-confusion", null, "verification-key");
    }
    if (left.verificationKey && right.verificationKey && left.verificationKey.nPublic === right.verificationKey.nPublic) {
      failure(failures, "key-confusion", null, "nPublic");
    }
  }
  let snarkVersion = null;
  try {
    snarkVersion = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "node_modules/snarkjs/package.json"), "utf8")).version;
  } catch {
    snarkVersion = null;
  }
  return {
    ok: failures.length === 0,
    production: false,
    mode: "development",
    fallback: false,
    zkeyByteEqualityRequired: false,
    productionCeremony: false,
    failures,
    roles: Object.fromEntries(reports.map((item) => [item.id, item])),
    toolchain: { node: process.version, snarkjs: snarkVersion, circom: options.circomVersion ?? null },
  };
}

function compileCircuit(circom, source, outDir, root) {
  fs.mkdirSync(outDir, { recursive: true });
  return spawnSync(
    circom,
    [source, "--r1cs", "--wasm", "--sym", "-l", path.join(root, "node_modules", "circomlib", "circuits"), "-o", outDir],
    { encoding: "utf8" },
  );
}

export function classifyCircomProbe(probe) {
  if (!probe || probe.error?.code === "ENOENT") {
    return { code: "tool-missing", detail: "circom" };
  }
  if (probe.error || probe.status !== 0) {
    return { code: "tool-blocked", detail: "circom:execution-refused" };
  }
  return null;
}

function toolStop(code, detail, protectedBefore) {
  return {
    ok: false,
    stage: "tool",
    failures: [{ code, role: null, detail }],
    roles: {},
    protectedUnchanged: unchanged(protectedBefore),
  };
}

export async function rebuildInTemp(options = {}) {
  const root = options.root ?? PROJECT_ROOT;
  const library = options.snarkjs === undefined ? snarkjs : options.snarkjs;
  const roles = (options.roles ?? defaultRoles()).filter((role) => !options.role || role.id === options.role);
  const protectedBefore = new Map();
  for (const role of defaultRoles()) {
    for (const relPath of [role.source, role.manifest, ...Object.values(role.files)]) {
      const filePath = rel(PROJECT_ROOT, relPath);
      if (fs.existsSync(filePath)) protectedBefore.set(filePath, sha256File(filePath));
    }
  }
  let circom = options.circom;
  if (!circom) {
    try {
      circom = await ensureCircom();
    } catch (err) {
      const blocked = err && err.code === "CIRCOM_BLOCKED";
      return toolStop(
        blocked ? "tool-blocked" : "tool-missing",
        blocked ? "circom:execution-refused" : "circom",
        protectedBefore,
      );
    }
  }
  const probe = spawnSync(circom, ["--version"], { encoding: "utf8" });
  const refusal = classifyCircomProbe(probe);
  if (refusal) return toolStop(refusal.code, refusal.detail, protectedBefore);
  const reports = {};
  const failures = [];
  const createTempDir = options.createTempDir ?? ((prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const removeTempDir = options.removeTempDir ?? ((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  for (const role of roles) {
    let outDir = null;
    const stage = { id: role.id, outDir: null, r1csMatch: null, wasmMatch: null, signalOrderMatch: null, zkeyByteEqualityRequired: false, zkeyCompared: false };
    try {
      outDir = createTempDir(`frozencore-${role.id}-`);
    } catch {
      failure(failures, "temp-directory-failed", role.id, "create");
      stage.stage = "temp-directory";
      reports[role.id] = stage;
      continue;
    }
    stage.outDir = outDir;
    try {
      const compiled = compileCircuit(circom, rel(root, role.source), outDir, root);
      if (compiled.status !== 0) {
        failure(failures, "rebuild-compile", role.id, "circom");
        stage.stage = "compile";
        reports[role.id] = stage;
        continue;
      }
      const base = role.id;
      const builtWasm = path.join(outDir, `${base}_js`, `${base}.wasm`);
      const builtR1cs = path.join(outDir, `${base}.r1cs`);
      const builtSym = path.join(outDir, `${base}.sym`);
      if (!fs.existsSync(builtWasm) || !fs.existsSync(builtR1cs)) {
        failure(failures, "rebuild-compile", role.id, "outputs");
        stage.stage = "compile";
        reports[role.id] = stage;
        continue;
      }
      const activeWasm = rel(root, role.files.wasm);
      const activeR1cs = rel(root, role.files.r1cs);
      stage.r1csMatch = sha256File(builtR1cs) === sha256File(activeR1cs);
      stage.wasmMatch = sha256File(builtWasm) === sha256File(activeWasm);
      if (!stage.r1csMatch) failure(failures, "rebuild-r1cs", role.id, "sha256");
      if (!stage.wasmMatch) failure(failures, "rebuild-wasm", role.id, "sha256");
      const info = await library.r1cs.info(builtR1cs, silentLogger);
      stage.constraints = info.nConstraints;
      stage.publicInputs = info.nPubInputs;
      if (info.nPubInputs !== role.expectedPublicInputs) failure(failures, "public-input-count", role.id, "rebuild");
      const names = publicNames(builtSym, role.expectedPublicInputs);
      stage.signalOrderMatch = names.join(",") === role.publicSignals.join(",");
      if (!stage.signalOrderMatch) failure(failures, "signal-order", role.id, "rebuild");
      const activeInfo = await library.r1cs.info(activeR1cs, silentLogger);
      if (info.nConstraints !== activeInfo.nConstraints) failure(failures, "constraint-count", role.id, "rebuild");
      stage.stage = stage.r1csMatch && stage.wasmMatch && stage.signalOrderMatch ? "matched" : "compare";
      reports[role.id] = stage;
    } finally {
      if (outDir) {
        try {
          removeTempDir(outDir);
        } catch {
          failure(failures, "temp-directory-failed", role.id, "remove");
        }
      }
    }
  }
  const protectedUnchanged = unchanged(protectedBefore);
  if (!protectedUnchanged) failure(failures, "protected-files-changed", null, "rebuild");
  return {
    ok: failures.length === 0,
    stage: failures.length === 0 ? "matched" : "compare",
    zkeyByteEqualityRequired: false,
    zkeyCompared: false,
    failures,
    roles: reports,
    protectedUnchanged,
    circom: (probe.stdout || probe.stderr || "").trim(),
  };
}

function unchanged(snapshot) {
  for (const [filePath, hash] of snapshot) {
    if (!fs.existsSync(filePath) || sha256File(filePath) !== hash) return false;
  }
  return true;
}
