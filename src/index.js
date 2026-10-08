// SPDX-License-Identifier: GPL-3.0-or-later
export {
  ARTIFACTS,
  ML_DSA_ALGORITHM,
  ML_DSA_CONTEXT,
  PROJECT_ROOT,
  PUBLIC_SIGNALS,
  SCHEMA,
  VERSION,
} from "./constants.js";
export { AuthenticityError, InputError, IntegrityError, ProofError } from "./errors.js";
export { poseidonCommitment } from "./commitment.js";
export { checkIntegrity } from "./integrity/check.js";
export { artifactDigest } from "./integrity/hash.js";
export { prove, proveToFile } from "./prover/prove.js";
export { readEnvelope, verify, verifyGroth16 } from "./verifier/verify.js";
export {
  digestArtifacts,
  fromHex,
  generateKeyPair,
  signDigest,
  toHex,
  verifyDigest,
} from "./authenticity/mldsa.js";
