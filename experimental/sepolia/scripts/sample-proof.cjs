const { toSolidityArgs } = require("./solidity-proof.cjs");

async function createSample() {
  const { poseidonCommitment } = await import("../../../src/commitment.js");
  const { prove } = await import("../../../src/prover/prove.js");
  const { verify } = await import("../../../src/verifier/verify.js");
  const secret = "246813579";
  const commitment = await poseidonCommitment(BigInt(secret));
  const envelope = await prove({ secret, commitment });
  if ((await verify(envelope)) !== true) {
    throw new Error("既存のオフチェーン検証に失敗しました");
  }
  const args = await toSolidityArgs(envelope.proof, envelope.publicSignals);
  return {
    commitment,
    publicSignals: envelope.publicSignals,
    args,
  };
}

module.exports = { createSample };
