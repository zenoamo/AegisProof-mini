// SPDX-License-Identifier: GPL-3.0-or-later
import path from "node:path";
import { fileURLToPath } from "node:url";
import schema from "../schema/public-signals-v1.json" with { type: "json" };
import domains from "../schema/domains.json" with { type: "json" };

const here = path.dirname(fileURLToPath(import.meta.url));

export const FROZENCORE_ROOT = path.resolve(here, "..");
export const PROJECT_ROOT = path.resolve(FROZENCORE_ROOT, "..");
export const VERSION = schema.version;
export const SCHEMA = schema.schema;
export const GUEST_SCHEMA = "frozencore-guest-journal-v1";
export const GUEST_VERSION = "frozencore-guest-experimental-0.1.0";
export const TEE_SCHEMA = "frozencore-software-report-v1";
export const PRODUCTION = false;
export const PROTOCOL_VERSION = BigInt(domains.protocolVersion);
export const PUBLIC_SIGNALS = Object.freeze(schema.order);
export const GUEST_PUBLIC_SIGNALS = Object.freeze([
  "zkvmProgramId",
  "inputRoot",
  "outputCommitment",
  "executionId",
]);
export const PRIVATE_SIGNALS = Object.freeze([
  "secret",
  "context",
  "subjectNonce",
  "inputSecret",
  "inputSalt",
  "authSecret",
  "outputSecret",
  "programBody",
  "revocationSibling",
  "revocationPathBit",
  "stateSibling",
  "statePathBit",
  "runtimeConfigWord",
]);

export const DOMAINS = Object.freeze(
  Object.fromEntries(Object.entries(domains.domains).map(([name, value]) => [name, BigInt(value)])),
);

export const MAX_64 = (1n << 64n) - 1n;
export const MAX_128 = (1n << 128n) - 1n;
export const MAX_160 = (1n << 160n) - 1n;

export const ARTIFACTS = Object.freeze({
  "statement.wasm": "frozencore/dev/statement/statement.wasm",
  "statement.r1cs": "frozencore/dev/statement/statement.r1cs",
  "statement.zkey": "frozencore/dev/statement/statement.zkey",
  "statement.ptau": "frozencore/dev/statement/pot_final.ptau",
  "statement.vk": "frozencore/dev/statement/verification_key.json",
  "guest.wasm": "frozencore/dev/guest/guest.wasm",
  "guest.r1cs": "frozencore/dev/guest/guest.r1cs",
  "guest.zkey": "frozencore/dev/guest/guest.zkey",
  "guest.ptau": "frozencore/dev/guest/pot_final.ptau",
  "guest.vk": "frozencore/dev/guest/verification_key.json",
  "guest.manifest": "frozencore/dev/guest/manifest.json",
  manifest: "frozencore/dev/statement/manifest.json",
});

export const DEFAULT_GUEST_PROGRAM = Object.freeze([
  Object.freeze([1n, 0n]),
  Object.freeze([2n, 1n]),
  Object.freeze([3n, 0n]),
  Object.freeze([3n, 0n]),
]);
