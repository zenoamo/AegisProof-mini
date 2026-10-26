// SPDX-License-Identifier: GPL-3.0-or-later
import { MAX_64, PUBLIC_SIGNALS } from "./constants.js";
import { InputError } from "./errors.js";

function integer(value, label) {
  if (typeof value === "bigint") return value;
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new InputError(`${label} は正規の十進である必要があります`);
  }
  return BigInt(value);
}

// Circuit relation only. This does not read a clock.
export function checkTimeOrder(issuedAt, expiresAt) {
  try {
    const issued = integer(issuedAt, "issuedAt");
    const expires = integer(expiresAt, "expiresAt");
    if (issued < 0n || expires < 0n || issued > MAX_64 || expires > MAX_64) {
      return { ok: false, verified: false, status: "rejected", reason: "out-of-range" };
    }
    if (issued >= expires) {
      return { ok: false, verified: false, status: "rejected", reason: "issuedAt-not-before-expiresAt" };
    }
    return { ok: true, verified: false, status: "order-only", wallClockCompared: false };
  } catch (error) {
    if (error instanceof InputError) {
      return { ok: false, verified: false, status: "malformed", reason: error.message };
    }
    throw error;
  }
}

// No trusted clock is defined. A caller-supplied timestamp is ignored.
export function checkWallClock() {
  return {
    id: "wallClock",
    subject: "expiry against a trusted clock",
    trustAnchor: null,
    inputs: ["expiresAt", "trustedNow"],
    verified: false,
    status: "not-configured",
    outcome: "not-configured",
    reason: "no-trusted-clock",
    wallClockCompared: false,
  };
}

export function rootsEqual(claimed, expected) {
  if (typeof claimed !== "string" || typeof expected !== "string") return false;
  return claimed === expected;
}

export function checkRevocation() {
  return {
    id: "revocation",
    subject: "subject is absent from a trusted revocation set",
    trustAnchor: null,
    inputs: ["revocationRoot", "trustedRoot"],
    verified: false,
    status: "not-configured",
    outcome: "not-configured",
    reason: "no-revocation-authority",
  };
}

export function checkState() {
  return {
    id: "state",
    subject: "subject state matches a trusted root",
    trustAnchor: null,
    inputs: ["stateRoot", "trustedRoot"],
    verified: false,
    status: "not-configured",
    outcome: "not-configured",
    reason: "no-state-authority",
  };
}

export function checkAuthorization() {
  return {
    id: "authorization",
    subject: "a signature under a trusted scheme and key",
    trustAnchor: null,
    inputs: ["message", "publicKey", "signature"],
    verified: false,
    status: "not-configured",
    outcome: "not-configured",
    reason: "no-signature-scheme",
  };
}

export function checkZkvm(input = {}) {
  const commitmentMatch = typeof input.claimed === "string" && input.claimed === input.computed;
  return {
    id: "zkvm",
    subject: "a ZKVM proof of the execution",
    trustAnchor: null,
    inputs: ["proof", "programId", "journal"],
    verified: false,
    status: "not-configured",
    outcome: "not-configured",
    reason: "no-zkvm-verifier",
    commitmentMatch,
  };
}

export function checkAttestation(input = {}) {
  const digestMatch = typeof input.claimed === "string" && input.claimed === input.observed;
  return {
    id: "attestation",
    subject: "a hardware attestation quote",
    trustAnchor: null,
    inputs: ["quote", "measurement"],
    verified: false,
    status: "not-configured",
    outcome: "not-configured",
    reason: "no-attestation-trust-anchor",
    digestMatch,
  };
}

const REQUIRED_EXTERNAL = ["wallClock", "revocation", "state", "authorization", "zkvm", "attestation"];

function outcomeOf(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return "missing";
  if (result.outcome === "error" || result.status === "error") return "error";
  if (result.outcome === "missing" || result.status === "missing") return "missing";
  if (result.status === "not-configured" || result.outcome === "not-configured") return "not-configured";
  if (result.verified === true && result.status === "verified" && result.mock !== true && result.outcome === "verified") {
    return "verified";
  }
  return "rejected";
}

function guard(fn) {
  try {
    const result = fn();
    const outcome = outcomeOf(result);
    if (outcome === "missing") {
      return { verified: false, status: "missing", outcome: "missing", reason: "missing-result", mock: false };
    }
    const verified = outcome === "verified";
    return { ...result, outcome, verified, mock: result.mock === true };
  } catch {
    return { verified: false, status: "error", outcome: "error", reason: "check-failed", mock: false };
  }
}

function refuseOrRunTest(name, options) {
  if (!options.verifiers || !Object.hasOwn(options.verifiers, name)) return null;
  if (options.mode === "production" || options.allowTestVerifiers !== true) {
    return {
      id: name,
      verified: false,
      status: "error",
      outcome: "error",
      reason: "test-verifier-forbidden",
      mock: true,
    };
  }
  return guard(() => {
    const result = options.verifiers[name]();
    if (result && result.verified === true) {
      return {
        ...result,
        verified: false,
        status: "not-configured",
        outcome: "not-configured",
        reason: "mock-is-not-verification",
        mock: true,
      };
    }
    return result ? { ...result, mock: true } : result;
  });
}

export function externalReport(signals = {}, options = {}) {
  const mode = options.mode === "production" ? "production" : "development";
  const nextOptions = { ...options, mode };
  const pick = (name, real) => refuseOrRunTest(name, nextOptions) ?? guard(real);
  const report = {
    mode,
    productionKeys: false,
    mock: false,
    timeOrder: guard(() => checkTimeOrder(signals.issuedAt, signals.expiresAt)),
    wallClock: pick("wallClock", () => checkWallClock()),
    revocation: pick("revocation", () => checkRevocation()),
    state: pick("state", () => checkState()),
    authorization: pick("authorization", () => checkAuthorization()),
    zkvm: pick("zkvm", () => checkZkvm()),
    attestation: pick("attestation", () => checkAttestation()),
    service: { invoked: false, timedOut: false, mock: false },
  };
  report.mock = REQUIRED_EXTERNAL.some((name) => report[name]?.mock === true);
  return { ...report, externallyComplete: isExternallyComplete(report) };
}

export function isExternallyComplete(report) {
  if (!report || typeof report !== "object" || report.mock === true) return false;
  return REQUIRED_EXTERNAL.every((name) => {
    const item = report[name];
    return item?.verified === true && item?.status === "verified" && item?.outcome === "verified" && item?.mock !== true;
  });
}

export function signalsByName(publicSignals) {
  if (!Array.isArray(publicSignals) || publicSignals.length !== PUBLIC_SIGNALS.length) return null;
  return Object.fromEntries(PUBLIC_SIGNALS.map((name, index) => [name, publicSignals[index]]));
}
