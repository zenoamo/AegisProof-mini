// SPDX-License-Identifier: GPL-3.0-or-later
// Public data exchanged around the local TEE experiment.
// This is not the AegisProof-mini proof envelope from src/verifier/verify.js.
// `secret` stays on the call into the backend and is not a field of this result.

export const LOCAL_TEE_SCHEMA = "aegisproof-mini-local-tee-result-v1";
export const LOCAL_TEE_VERSION = "aegisproof-mini-local-tee-0.1.0";

const RESULT_KEYS = Object.freeze([
  "schema",
  "version",
  "backend",
  "verified",
  "commitment",
  "proofEnvelope",
]);

export class TeeBoundaryError extends Error {
  constructor(message, code = "TEE_BOUNDARY") {
    super(message);
    this.name = "TeeBoundaryError";
    this.code = code;
  }
}

export function hasSecretField(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.hasOwn(value, "secret") || Object.hasOwn(value, "secretKey")) return true;
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && hasSecretField(child)) return true;
  }
  return false;
}

export function assertNoSecretField(value, label) {
  if (hasSecretField(value)) {
    throw new TeeBoundaryError(`${label} に秘密入力のフィールドがあります`);
  }
}

function coordinate(value) {
  if (typeof value !== "string") {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  return value;
}

function g1(values) {
  if (!Array.isArray(values) || values.length < 3) {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  return [coordinate(values[0]), coordinate(values[1]), coordinate(values[2])];
}

function g2(values) {
  if (!Array.isArray(values) || values.length < 3) {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  return [0, 1, 2].map((index) => {
    const row = values[index];
    if (!Array.isArray(row) || row.length < 2) {
      throw new TeeBoundaryError("証明エンベロープの形式が不正です");
    }
    return [coordinate(row[0]), coordinate(row[1])];
  });
}

// Copies only the public Groth16 envelope. Extra names, including a witness
// stored under another key, are left behind.
export function publicProofEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  if (typeof value.version !== "string" || typeof value.schema !== "string") {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  if (typeof value.protocol !== "string" || typeof value.curve !== "string") {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  if (!Array.isArray(value.publicSignals) || value.publicSignals.some((item) => typeof item !== "string")) {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  if (!value.proof || typeof value.proof !== "object" || Array.isArray(value.proof)) {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  if (typeof value.proof.protocol !== "string" || typeof value.proof.curve !== "string") {
    throw new TeeBoundaryError("証明エンベロープの形式が不正です");
  }
  return {
    version: value.version,
    schema: value.schema,
    protocol: value.protocol,
    curve: value.curve,
    publicSignals: value.publicSignals.map((item) => item),
    proof: {
      protocol: value.proof.protocol,
      curve: value.proof.curve,
      pi_a: g1(value.proof.pi_a),
      pi_b: g2(value.proof.pi_b),
      pi_c: g1(value.proof.pi_c),
    },
  };
}

export function createPublicResult({ backend, commitment, proofEnvelope }) {
  const result = {
    schema: LOCAL_TEE_SCHEMA,
    version: LOCAL_TEE_VERSION,
    backend: {
      id: backend.id,
      kind: backend.kind,
      claims: {
        hardwareIsolation: backend.claims.hardwareIsolation,
        remoteAttestation: backend.claims.remoteAttestation,
      },
      attestation: null,
    },
    verified: {
      hardwareIsolation: false,
      remoteAttestation: false,
      attestation: null,
    },
    commitment,
    proofEnvelope: publicProofEnvelope(proofEnvelope),
  };
  assertNoSecretField(result, "公開結果");
  assertNoSecretField(result.proofEnvelope, "証明エンベロープ");
  return result;
}

export function serializePublicResult(result) {
  return JSON.stringify(parsePublicResult(result));
}

export function parsePublicResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TeeBoundaryError("公開結果の形式が不正です");
  }
  for (const key of Object.keys(value)) {
    if (!RESULT_KEYS.includes(key)) {
      throw new TeeBoundaryError("公開結果に未知のフィールドがあります");
    }
  }
  if (value.schema !== LOCAL_TEE_SCHEMA || value.version !== LOCAL_TEE_VERSION) {
    throw new TeeBoundaryError("公開結果の schema または version が一致しません");
  }
  assertNoSecretField(value, "公開結果");
  if (typeof value.commitment !== "string" || !value.proofEnvelope || typeof value.proofEnvelope !== "object") {
    throw new TeeBoundaryError("公開結果の commitment または証明エンベロープが不正です");
  }
  if (!value.backend || value.backend.attestation !== null) {
    throw new TeeBoundaryError("未検証のアテステーションは受理できません");
  }
  if (!value.backend.claims || value.backend.claims.hardwareIsolation !== false || value.backend.claims.remoteAttestation !== false) {
    throw new TeeBoundaryError("未検証の TEE 保証を主張する結果は受理できません");
  }
  if (!value.verified || value.verified.hardwareIsolation !== false || value.verified.remoteAttestation !== false || value.verified.attestation !== null) {
    throw new TeeBoundaryError("検証済みの TEE 保証として扱える結果ではありません");
  }
  if (typeof value.backend.id !== "string" || typeof value.backend.kind !== "string") {
    throw new TeeBoundaryError("公開結果の形式が不正です");
  }
  return {
    schema: value.schema,
    version: value.version,
    backend: {
      id: value.backend.id,
      kind: value.backend.kind,
      claims: {
        hardwareIsolation: false,
        remoteAttestation: false,
      },
      attestation: null,
    },
    verified: {
      hardwareIsolation: false,
      remoteAttestation: false,
      attestation: null,
    },
    commitment: value.commitment,
    proofEnvelope: publicProofEnvelope(value.proofEnvelope),
  };
}
