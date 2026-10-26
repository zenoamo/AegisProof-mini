const { toSolidityArgs } = require("./solidity-proof.cjs");

async function createSample(overrides = {}) {
  const { prove, statementFromParts, verify } = await import("../../src/index.js");
  const statement = await statementFromParts({
    secret: overrides.secret ?? 246813579n,
    context: overrides.context ?? 11n,
    policyId: overrides.policyId ?? 7n,
    epoch: overrides.epoch ?? 3n,
  });
  const envelope = await prove({
    secret: statement.secret,
    context: statement.context,
    policyId: statement.policyId,
    epoch: statement.epoch,
    commitment: statement.commitment,
    nullifier: statement.nullifier,
    contextHash: statement.contextHash,
  });
  if ((await verify(envelope)) !== true) {
    throw new Error("オフチェーン検証に失敗しました");
  }
  if (envelope.publicSignals.length !== 5) {
    throw new Error("公開信号は 5 個である必要があります");
  }
  const args = await toSolidityArgs(envelope.proof, envelope.publicSignals);
  return {
    commitment: statement.commitment,
    nullifier: statement.nullifier,
    contextHash: statement.contextHash,
    policyId: statement.policyId,
    epoch: statement.epoch,
    publicSignals: envelope.publicSignals,
    args,
  };
}

module.exports = { createSample };
