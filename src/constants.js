// SPDX-License-Identifier: GPL-3.0-or-later
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(here, "..");
export const VERSION = "aegisproof-mini-0.1.0";
export const SCHEMA = "aegisproof-mini-public-signals-v1";

// BN254 scalar field modulus. snarkjs calls this curve "bn128".
export const BN254_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const PUBLIC_SIGNALS = Object.freeze(["commitment"]);

// Manifest keys stay short. Paths stay inside this repository.
export const ARTIFACTS = Object.freeze({
  "circuit.wasm": "circuit/main.wasm",
  "circuit.r1cs": "circuit/main.r1cs",
  "circuit.zkey": "circuit/mini.zkey",
  "verification_key.json": "keys/verification_key.json",
});

export const MANIFEST_REL = "artifacts/manifest.json";
export const MANIFEST_SHA_REL = "artifacts/manifest.sha256";
export const BASELINE_REL = "artifacts/baseline.json";

export const ML_DSA_ALGORITHM = "ML-DSA-87";
export const ML_DSA_CONTEXT = "aegisproof-mini/manifest-authenticity/v1";

export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_PROOF_BYTES = 2 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 256 * 1024;
