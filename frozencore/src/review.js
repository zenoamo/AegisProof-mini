// SPDX-License-Identifier: GPL-3.0-or-later
import { poseidonHash } from "../../src/commitment.js";
import { isCanonicalFieldString } from "../../src/field.js";
import { verify } from "./verify.js";
import { verifyGuest } from "./guest-verify.js";
import { externalReport, signalsByName } from "./external.js";
import { DOMAINS, GUEST_PUBLIC_SIGNALS, PUBLIC_SIGNALS } from "./constants.js";

export const REVIEW_LIMITS = Object.freeze({
  publicMatchIsNotAProof: true,
  zkvmTupleIsNotAZkvmVerifier: true,
  programVersionIsNotTheGuestProgramIdConstant: true,
  externalAuthoritiesConfigured: false,
  production: false,
});

// groth16 and the external checks stay separate.
// A true Groth16 result does not mark external properties as verified.
export async function reviewStatement(envelope) {
  const groth16 = await pass(() => verify(envelope));
  const named = signalsByName(envelope?.publicSignals);
  const external = externalReport(named ?? {});
  return {
    groth16,
    external,
    externallyComplete: external.externallyComplete === true,
    verified: false,
  };
}

function namedSignals(envelope, order) {
  if (!envelope || !Array.isArray(envelope.publicSignals) || !Array.isArray(envelope.signalNames)) return null;
  if (envelope.publicSignals.length !== order.length || envelope.signalNames.length !== order.length) return null;
  if (envelope.signalNames.join(",") !== order.join(",")) return null;
  return Object.fromEntries(order.map((name, index) => [name, envelope.publicSignals[index]]));
}

// String equality of the four shared public values. This is not a proof check.
export function guestPublicMatch(guestEnvelope, statementEnvelope) {
  const guest = namedSignals(guestEnvelope, GUEST_PUBLIC_SIGNALS);
  const statement = namedSignals(statementEnvelope, PUBLIC_SIGNALS);
  if (!guest || !statement) return false;
  return GUEST_PUBLIC_SIGNALS.every((name) => {
    const left = guest[name];
    const right = statement[name];
    return typeof left === "string"
      && left === right
      && isCanonicalFieldString(left);
  });
}

export async function statementBindings(statementEnvelope) {
  const named = namedSignals(statementEnvelope, PUBLIC_SIGNALS);
  if (!named) return { programVersionIsOne: false, zkvmTupleBound: false };
  const programVersionIsOne = named.programVersion === "1";
  let zkvmTupleBound = false;
  try {
    const parts = [DOMAINS.ZKVM_BIND, ...GUEST_PUBLIC_SIGNALS.map((name) => BigInt(named[name]))];
    zkvmTupleBound = await poseidonHash(parts) === named.zkvmProofCommitment;
  } catch {
    zkvmTupleBound = false;
  }
  return { programVersionIsOne, zkvmTupleBound };
}

async function pass(fn) {
  try {
    return (await fn()) === true;
  } catch {
    return false;
  }
}

async function passObject(fn) {
  try {
    const value = await fn();
    if (!value || typeof value !== "object") return { programVersionIsOne: false, zkvmTupleBound: false };
    return {
      programVersionIsOne: value.programVersionIsOne === true,
      zkvmTupleBound: value.zkvmTupleBound === true,
    };
  } catch {
    return { programVersionIsOne: false, zkvmTupleBound: false };
  }
}

// Guest Groth16, statement Groth16, and the four-value match stay separate.
// Unconfigured external checks keep the combined result unsuccessful.
export async function reviewPair(guestEnvelope, statementEnvelope, options = {}) {
  const guest = await pass(() => verifyGuest(guestEnvelope, options));
  const statement = await pass(() => verify(statementEnvelope, options));
  let publicMatch = false;
  try {
    publicMatch = guestPublicMatch(guestEnvelope, statementEnvelope) === true;
  } catch {
    publicMatch = false;
  }
  const bindings = await passObject(() => statementBindings(statementEnvelope));
  const named = signalsByName(statementEnvelope?.publicSignals);
  let external;
  try {
    external = externalReport(named ?? {}, options);
  } catch {
    external = { externallyComplete: false, mock: false, status: "error", outcome: "error" };
  }
  return seal({ guest, statement, publicMatch, bindings, external });
}

function seal(parts) {
  const guest = parts.guest === true;
  const statement = parts.statement === true;
  const publicMatch = parts.publicMatch === true;
  const programVersionIsOne = parts.bindings?.programVersionIsOne === true;
  const zkvmTupleBound = parts.bindings?.zkvmTupleBound === true;
  const proofsValid = guest && statement;
  const bindingsValid = programVersionIsOne && zkvmTupleBound;
  const externallyComplete = parts.external?.externallyComplete === true && parts.external?.mock !== true;
  const verified = proofsValid && publicMatch && bindingsValid && externallyComplete;
  return Object.freeze({
    guest,
    statement,
    proofsValid,
    publicMatch,
    bindings: Object.freeze({ programVersionIsOne, zkvmTupleBound }),
    bindingsValid,
    external: Object.freeze({ ...parts.external }),
    externallyComplete,
    limits: REVIEW_LIMITS,
    verified,
  });
}
