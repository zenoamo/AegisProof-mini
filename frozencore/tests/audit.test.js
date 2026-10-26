// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256File } from "../../src/integrity/hash.js";
import { ARTIFACTS, PROJECT_ROOT } from "../src/constants.js";
import { auditArtifacts, classifyCircomProbe, defaultRoles, rebuildInTemp } from "../src/audit.js";

function snapshot() {
  return [
    ARTIFACTS["statement.zkey"],
    ARTIFACTS["statement.vk"],
    ARTIFACTS["statement.r1cs"],
    ARTIFACTS["guest.zkey"],
    ARTIFACTS["guest.vk"],
    ARTIFACTS["guest.r1cs"],
    ARTIFACTS.manifest,
    ARTIFACTS["guest.manifest"],
    "frozencore/artifacts/statement.zkey",
    "frozencore/keys/statement_verification_key.json",
    "frozencore/artifacts/guest.r1cs",
  ].map((rel) => sha256File(path.join(PROJECT_ROOT, rel)));
}

test("development artifacts pass an independent audit without rewriting them", { timeout: 180000 }, async () => {
  const before = snapshot();
  const report = await auditArtifacts({ confineToRoot: true });
  assert.equal(report.ok, true);
  assert.equal(report.production, false);
  assert.equal(report.fallback, false);
  assert.equal(report.zkeyByteEqualityRequired, false);
  assert.equal(report.roles.guest.circuit.publicInputs, 4);
  assert.equal(report.roles.guest.cryptographic.verifyFromR1cs, true);
  assert.equal(report.roles.guest.cryptographic.verificationKeyMatchesExport, true);
  assert.equal(report.roles.statement.circuit.publicInputs, 30);
  assert.equal(report.roles.statement.cryptographic.verifyFromR1cs, true);
  assert.equal(report.roles.statement.circuit.constraints, 13082);
  assert.equal(report.roles.guest.circuit.constraints, 3942);
  assert.equal(typeof report.roles.guest.source.sha256, "string");
  assert.deepEqual(snapshot(), before);
});

test("a changed manifest hash is rejected and the real files stay in place", async () => {
  const before = snapshot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frozencore-audit-"));
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.manifest"]), "utf8"));
  manifest.artifacts["guest.r1cs"] = "00";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const role = defaultRoles()[0];
  role.manifest = path.relative(PROJECT_ROOT, manifestPath).replaceAll("\\", "/");
  const report = await auditArtifacts({ roles: [role] });
  assert.equal(report.ok, false);
  assert.equal(report.failures.some((item) => item.code === "manifest-hash-mismatch"), true);
  assert.equal(report.fallback, false);
  assert.deepEqual(snapshot(), before);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a missing artifact, a legacy key, a swapped key, and a reordered signal list fail closed", async () => {
  const missing = defaultRoles()[0];
  missing.files = { ...missing.files, ptau: "frozencore/dev/guest/missing.ptau" };
  const missingReport = await auditArtifacts({ roles: [missing] });
  assert.equal(missingReport.ok, false);
  assert.equal(missingReport.failures.some((item) => item.code === "missing-artifact"), true);

  const legacy = defaultRoles()[1];
  legacy.files = { ...legacy.files, zkey: "frozencore/artifacts/statement.zkey" };
  const legacyReport = await auditArtifacts({ roles: [legacy] });
  assert.equal(legacyReport.ok, false);
  assert.equal(legacyReport.failures.some((item) => item.code === "legacy-artifact"), true);
  assert.equal(legacyReport.failures.some((item) => item.code === "manifest-hash-mismatch"), true);

  const swapped = defaultRoles();
  swapped[0].files = { ...swapped[0].files, vk: swapped[1].files.vk, zkey: swapped[1].files.zkey };
  const swappedReport = await auditArtifacts({ roles: [swapped[0]] });
  assert.equal(swappedReport.ok, false);
  assert.equal(swappedReport.failures.some((item) => item.code === "manifest-hash-mismatch" || item.code === "public-input-count"), true);

  const reordered = defaultRoles()[0];
  reordered.publicSignals = [...reordered.publicSignals].reverse();
  const orderReport = await auditArtifacts({ roles: [reordered] });
  assert.equal(orderReport.ok, false);
  assert.equal(orderReport.failures.some((item) => item.code === "signal-order"), true);
});

test("production mode and a missing verifier fail without falling back", async () => {
  const production = await auditArtifacts({ mode: "production" });
  assert.equal(production.ok, false);
  assert.equal(production.failures[0].code, "development-keys-in-production-mode");
  assert.equal(production.fallback, false);
  const missingTool = await auditArtifacts({ snarkjs: {} });
  assert.equal(missingTool.ok, false);
  assert.equal(missingTool.failures[0].code, "tool-missing");
});

test("a cryptographic verification failure is not reported as success", async () => {
  const vk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.vk"]), "utf8"));
  const library = {
    r1cs: {
      async info() {
        return { nConstraints: 3942, nPubInputs: 4, nPrvInputs: 3, nOutputs: 0 };
      },
    },
    zKey: {
      async exportVerificationKey() {
        return vk;
      },
      async verifyFromR1cs() {
        return false;
      },
    },
  };
  const report = await auditArtifacts({ snarkjs: library, roles: [defaultRoles()[0]] });
  assert.equal(report.ok, false);
  assert.equal(report.failures.some((item) => item.code === "cryptographic-verification-failed"), true);
  assert.equal(report.roles.guest.cryptographic.performed, true);
});

test("a temp rebuild matches r1cs and wasm and does not replace development keys", { timeout: 180000 }, async () => {
  const before = snapshot();
  const report = await rebuildInTemp();
  assert.equal(report.ok, true);
  assert.equal(report.zkeyByteEqualityRequired, false);
  assert.equal(report.zkeyCompared, false);
  assert.equal(report.roles.guest.r1csMatch, true);
  assert.equal(report.roles.guest.wasmMatch, true);
  assert.equal(report.roles.statement.r1csMatch, true);
  assert.equal(report.roles.statement.wasmMatch, true);
  assert.equal(report.protectedUnchanged, true);
  assert.deepEqual(snapshot(), before);
});

test("an OS refusal to start circom is not a compile match or a version mismatch", () => {
  const blocked = classifyCircomProbe({ status: null, error: { code: "UNKNOWN", errno: -4094 } });
  assert.equal(blocked.code, "tool-blocked");
  assert.equal(blocked.detail, "circom:execution-refused");
  const missing = classifyCircomProbe({ status: null, error: { code: "ENOENT" } });
  assert.equal(missing.code, "tool-missing");
  assert.equal(classifyCircomProbe({ status: 0, stdout: "circom compiler 2.2.3\n" }), null);
});

test("a failed temp rebuild leaves the development artifacts in place", async () => {
  const before = snapshot();
  const report = await rebuildInTemp({ circom: path.join(os.tmpdir(), "frozencore-missing-circom") });
  assert.equal(report.ok, false);
  assert.equal(report.failures[0].code, "tool-missing");
  assert.equal(report.protectedUnchanged, true);
  assert.deepEqual(snapshot(), before);
});

function guestVk() {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.vk"]), "utf8"));
}

function libraryFor(overrides = {}) {
  const vk = guestVk();
  return {
    r1cs: {
      async info(file) {
        if (overrides.info) return overrides.info(file);
        const statement = String(file).includes("statement");
        return statement
          ? { nConstraints: 13082, nPubInputs: 30, nPrvInputs: 13, nOutputs: 0 }
          : { nConstraints: 3942, nPubInputs: 4, nPrvInputs: 3, nOutputs: 0 };
      },
    },
    zKey: {
      async exportVerificationKey(file) {
        if (overrides.exportVerificationKey) return overrides.exportVerificationKey(file, vk);
        const statement = String(file).includes("statement");
        const relPath = statement ? ARTIFACTS["statement.vk"] : ARTIFACTS["guest.vk"];
        return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relPath), "utf8"));
      },
      async verifyFromR1cs(...args) {
        if (overrides.verifyFromR1cs) return overrides.verifyFromR1cs(...args);
        return true;
      },
    },
  };
}

function tempManifest(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frozencore-audit-"));
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.manifest"]), "utf8"));
  mutate(manifest);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const role = defaultRoles()[0];
  role.manifest = path.relative(PROJECT_ROOT, manifestPath).replaceAll("\\", "/");
  return { dir, role };
}

test("a one-byte artifact change, a wrong path, and a bad manifest field fail", async () => {
  const before = snapshot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frozencore-byte-"));
  const copyPath = path.join(dir, "guest.wasm");
  const bytes = fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.wasm"]));
  bytes[bytes.length - 1] ^= 0xff;
  fs.writeFileSync(copyPath, bytes);
  const changed = defaultRoles()[0];
  changed.files = { ...changed.files, wasm: path.relative(PROJECT_ROOT, copyPath).replaceAll("\\", "/") };
  const changedReport = await auditArtifacts({ roles: [changed] });
  assert.equal(changedReport.ok, false);
  assert.equal(changedReport.failures.some((item) => item.code === "manifest-hash-mismatch" && item.detail === "wasm"), true);
  assert.equal(changedReport.roles.guest.cryptographic.performed, false);

  const swapped = defaultRoles()[0];
  swapped.files = { ...swapped.files, r1cs: swapped.files.wasm };
  const swappedReport = await auditArtifacts({ roles: [swapped] });
  assert.equal(swappedReport.ok, false);
  assert.equal(swappedReport.failures.some((item) => item.code === "manifest-hash-mismatch" || item.code === "audit-exception"), true);

  const crossed = defaultRoles()[0];
  crossed.files = { ...crossed.files, zkey: "frozencore/dev/guest/../statement/statement.zkey" };
  const crossedReport = await auditArtifacts({ roles: [crossed], confineToRoot: true });
  assert.equal(crossedReport.ok, false);
  assert.equal(crossedReport.failures.some((item) => item.code === "manifest-hash-mismatch"), true);
  assert.equal(crossedReport.failures.some((item) => item.code === "path-escape"), false);

  const outside = path.join(dir, "outside.wasm");
  fs.writeFileSync(outside, Buffer.from("outside"));
  const escaped = defaultRoles()[0];
  escaped.files = { ...escaped.files, wasm: path.relative(PROJECT_ROOT, outside).replaceAll("\\", "/") };
  const escapedReport = await auditArtifacts({ roles: [escaped], confineToRoot: true });
  assert.equal(escapedReport.ok, false);
  assert.equal(escapedReport.failures.some((item) => item.code === "path-escape"), true);
  assert.equal(escapedReport.roles.guest.files.wasm.sha256, null);

  const missingFields = tempManifest((manifest) => {
    delete manifest.artifacts;
  });
  const missingFieldsReport = await auditArtifacts({ roles: [missingFields.role] });
  assert.equal(missingFieldsReport.ok, false);
  assert.equal(missingFieldsReport.failures.some((item) => item.code === "manifest-invalid"), true);

  const wrongType = tempManifest((manifest) => {
    manifest.circuit.constraints = "3942";
    manifest.artifacts["guest.r1cs"] = 12;
  });
  const wrongTypeReport = await auditArtifacts({ roles: [wrongType.role] });
  assert.equal(wrongTypeReport.ok, false);
  assert.equal(wrongTypeReport.failures.some((item) => item.code === "manifest-invalid"), true);

  const wrongSource = tempManifest((manifest) => {
    manifest.circuit.source = "frozencore/circuit/statement.circom";
  });
  const wrongSourceReport = await auditArtifacts({ roles: [wrongSource.role] });
  assert.equal(wrongSourceReport.ok, false);
  assert.equal(wrongSourceReport.failures.some((item) => item.code === "manifest-path-mismatch"), true);

  const brokenJsonDir = fs.mkdtempSync(path.join(os.tmpdir(), "frozencore-json-"));
  const brokenJsonPath = path.join(brokenJsonDir, "manifest.json");
  fs.writeFileSync(brokenJsonPath, "{");
  const broken = defaultRoles()[0];
  broken.manifest = path.relative(PROJECT_ROOT, brokenJsonPath).replaceAll("\\", "/");
  const brokenReport = await auditArtifacts({ roles: [broken] });
  assert.equal(brokenReport.ok, false);
  assert.equal(brokenReport.failures.some((item) => item.code === "manifest-invalid" && item.detail === "json"), true);

  assert.deepEqual(snapshot(), before);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(missingFields.dir, { recursive: true, force: true });
  fs.rmSync(wrongType.dir, { recursive: true, force: true });
  fs.rmSync(wrongSource.dir, { recursive: true, force: true });
  fs.rmSync(brokenJsonDir, { recursive: true, force: true });
});

test("symlink results and path swaps are not accepted as the named artifact", async () => {
  const before = snapshot();
  const wasmPath = path.join(PROJECT_ROOT, ARTIFACTS["guest.wasm"]);
  const linked = await auditArtifacts({
    roles: [defaultRoles()[0]],
    lstat(file) {
      if (path.resolve(file) === wasmPath) return { isSymbolicLink: () => true, isFile: () => false };
      return fs.lstatSync(file);
    },
  });
  assert.equal(linked.ok, false);
  assert.equal(linked.failures.some((item) => item.code === "symlink-rejected"), true);
  assert.equal(linked.roles.guest.files.wasm.sha256, null);
  assert.equal(linked.roles.guest.cryptographic.performed, false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frozencore-link-"));
  const linkPath = path.join(dir, "guest.wasm");
  let symlinkCode = "created";
  try {
    fs.symlinkSync(path.join(PROJECT_ROOT, ARTIFACTS["statement.wasm"]), linkPath);
  } catch (error) {
    symlinkCode = error.code;
  }
  if (symlinkCode === "created") {
    const role = defaultRoles()[0];
    role.files = { ...role.files, wasm: path.relative(PROJECT_ROOT, linkPath).replaceAll("\\", "/") };
    const realLink = await auditArtifacts({ roles: [role] });
    assert.equal(realLink.ok, false);
    assert.equal(realLink.failures.some((item) => item.code === "symlink-rejected"), true);
    assert.equal(realLink.roles.guest.files.wasm.sha256, null);
  } else {
    assert.equal(symlinkCode, "EPERM");
  }
  assert.deepEqual(snapshot(), before);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("cryptographic failures stay failures even when another check succeeds", async () => {
  const vk = guestVk();
  const wrongCount = structuredClone(vk);
  wrongCount.nPublic = 1;
  const countReport = await auditArtifacts({
    roles: [defaultRoles()[0]],
    snarkjs: libraryFor({
      exportVerificationKey() {
        return wrongCount;
      },
      verifyFromR1cs() {
        return true;
      },
    }),
  });
  assert.equal(countReport.ok, false);
  assert.equal(countReport.roles.guest.cryptographic.verifyFromR1cs, true);
  assert.equal(countReport.failures.some((item) => item.code === "verification-key-mismatch" && item.detail === "nPublic"), true);

  const wrongIc = structuredClone(vk);
  wrongIc.IC = [...vk.IC];
  wrongIc.IC[0] = [...wrongIc.IC[0]];
  wrongIc.IC[0][0] = "2";
  const icReport = await auditArtifacts({
    roles: [defaultRoles()[0]],
    snarkjs: libraryFor({
      exportVerificationKey() {
        return wrongIc;
      },
      verifyFromR1cs() {
        return true;
      },
    }),
  });
  assert.equal(icReport.ok, false);
  assert.equal(icReport.roles.guest.cryptographic.verificationKeyMatchesExport, false);
  assert.equal(icReport.failures.some((item) => item.code === "verification-key-mismatch" && item.detail === "IC"), true);

  const thrownVerify = await auditArtifacts({
    roles: [defaultRoles()[0]],
    snarkjs: libraryFor({
      verifyFromR1cs() {
        throw new Error("verify failed");
      },
    }),
  });
  assert.equal(thrownVerify.ok, false);
  assert.equal(thrownVerify.roles.guest.cryptographic.performed, true);
  assert.equal(thrownVerify.roles.guest.cryptographic.verifyFromR1cs, false);
  assert.equal(thrownVerify.failures.some((item) => item.code === "cryptographic-verification-failed" && item.detail === "threw"), true);

  const thrownExport = await auditArtifacts({
    roles: [defaultRoles()[0]],
    snarkjs: libraryFor({
      exportVerificationKey() {
        throw new Error("export failed");
      },
      verifyFromR1cs() {
        return true;
      },
    }),
  });
  assert.equal(thrownExport.ok, false);
  assert.equal(thrownExport.failures.some((item) => item.code === "verification-key-export-failed"), true);
  assert.equal(thrownExport.roles.guest.cryptographic.verifyFromR1cs, true);

  const roles = defaultRoles();
  roles[0].files = { ...roles[0].files, ptau: "frozencore/dev/guest/missing.ptau" };
  const partial = await auditArtifacts({ roles, snarkjs: libraryFor() });
  assert.equal(partial.ok, false);
  assert.equal(partial.failures.some((item) => item.code === "missing-artifact"), true);
  assert.equal(partial.roles.statement.cryptographic.verifyFromR1cs, true);

  const broken = defaultRoles()[0];
  broken.files = null;
  const exploded = await auditArtifacts({ roles: [broken], snarkjs: libraryFor() });
  assert.equal(exploded.ok, false);
  assert.equal(exploded.failures.some((item) => item.code === "audit-exception"), true);
});

test("audit exit status matches the JSON result", async () => {
  const { execute } = await import("../scripts/audit-artifacts.js");
  const success = { ok: true, failures: [], roles: {}, production: false };
  const passed = await execute(["node", "audit-artifacts.js"], {
    auditArtifacts: async () => success,
    rebuildInTemp: async () => ({ ok: true, failures: [], stage: "matched" }),
  });
  assert.equal(passed.exitCode, 0);
  assert.equal(JSON.parse(JSON.stringify(passed.payload)).audit.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(passed.payload)).audit.failures, []);

  const failureReport = { ok: false, failures: [{ code: "manifest-hash-mismatch", role: "guest", detail: "wasm" }], roles: {} };
  const failed = await execute(["node", "audit-artifacts.js"], {
    auditArtifacts: async () => failureReport,
  });
  assert.equal(failed.exitCode, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(failed.payload)).audit, failureReport);

  const rebuildFailed = await execute(["node", "audit-artifacts.js", "--rebuild"], {
    auditArtifacts: async () => success,
    rebuildInTemp: async () => ({ ok: false, failures: [{ code: "rebuild-r1cs", role: "guest", detail: "sha256" }], stage: "compare" }),
  });
  assert.equal(rebuildFailed.exitCode, 1);
  assert.equal(rebuildFailed.payload.audit.ok, true);
  assert.equal(rebuildFailed.payload.rebuild.ok, false);

  const spawned = spawnSync(process.execPath, ["frozencore/scripts/audit-artifacts.js", "--mode", "production"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(spawned.status, 0);
  const payload = JSON.parse(spawned.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.audit.ok, false);
  assert.equal(payload.audit.failures[0].code, "development-keys-in-production-mode");
  assert.equal(payload.rebuild, null);
});

test("temp directory failures stay inside the directory created for that rebuild", async () => {
  const before = snapshot();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "frozencore-keep-"));
  const sentinel = path.join(parent, "sentinel.txt");
  fs.writeFileSync(sentinel, "keep");
  const created = [];
  const removed = [];
  const compiled = await rebuildInTemp({
    circom: process.execPath,
    roles: [defaultRoles()[0]],
    createTempDir(prefix) {
      const dir = fs.mkdtempSync(path.join(parent, prefix));
      created.push(dir);
      return dir;
    },
    removeTempDir(dir) {
      removed.push(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  });
  assert.equal(compiled.ok, false);
  assert.equal(compiled.failures.some((item) => item.code === "rebuild-compile"), true);
  assert.deepEqual(removed, created);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "keep");
  for (const dir of created) assert.equal(fs.existsSync(dir), false);
  assert.equal(compiled.protectedUnchanged, true);

  const blocked = await rebuildInTemp({
    circom: process.execPath,
    roles: [defaultRoles()[0]],
    createTempDir() {
      throw new Error("temp full");
    },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.failures.some((item) => item.code === "temp-directory-failed"), true);
  assert.equal(blocked.protectedUnchanged, true);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "keep");
  assert.deepEqual(snapshot(), before);
  fs.rmSync(parent, { recursive: true, force: true });
});
