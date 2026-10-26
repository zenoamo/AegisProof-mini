const fs = require("node:fs");

const EXPECTED_DEPLOYMENT = {
  network: "sepolia",
  chainId: 11155111,
  contractAddress: "0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790",
  deployer: "0x23E7347D826Fe25dd709C52FB0036E793D54B8C0",
  deployTransactionHash: "0x48d7fc208986bcec01b28ca0806613969600584196c74b773440439d80f1bd4c",
  blockNumber: 11866912,
  gasUsed: "3513523",
  status: 1,
  publicSignalCount: 1,
  verification: {
    transactionHash: "0xee001b0be2d475973fc5292e3b2dab5df82d361eefc9875ea906a02eaae4749f",
    from: "0x23E7347D826Fe25dd709C52FB0036E793D54B8C0",
    to: "0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790",
    chainId: 11155111,
    blockNumber: 11866927,
    status: 1,
    gasUsed: "433214",
    lastValid: true,
    lastCommitment: "6572332521346552969132897450536910588528541939757210093019227709593248338264",
  },
};

const SECRET_KEYS = ["privatekey", "private_key", "mnemonic", "seed", "rpc", "secret"];

function assertNoSecretFields(value, path = "deployment") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.includes(key.toLowerCase())) {
      throw new Error(`${path}.${key} は deployment metadata に置けません`);
    }
    assertNoSecretFields(child, `${path}.${key}`);
  }
}

function assertDeploymentRecord(record) {
  if (!record || typeof record !== "object") {
    throw new Error("deployment metadata がありません");
  }
  assertNoSecretFields(record);
  const expected = EXPECTED_DEPLOYMENT;
  if (record.network !== expected.network) throw new Error("network が sepolia ではありません");
  if (record.chainId !== expected.chainId) throw new Error("chainId が 11155111 ではありません");
  if (record.contractAddress !== expected.contractAddress) throw new Error("contract address が一致しません");
  if (record.deployer !== expected.deployer) throw new Error("deployer が一致しません");
  if (record.deployTransactionHash !== expected.deployTransactionHash) {
    throw new Error("deploy transaction が一致しません");
  }
  if (record.blockNumber !== expected.blockNumber) throw new Error("deploy block が一致しません");
  if (record.gasUsed !== expected.gasUsed) throw new Error("deploy gas が一致しません");
  if (record.status !== expected.status) throw new Error("deploy status が一致しません");
  if (record.publicSignalCount !== expected.publicSignalCount) {
    throw new Error("publicSignalCount が 1 ではありません");
  }
  if (record.explorer?.contract !== `https://sepolia.etherscan.io/address/${expected.contractAddress}`) {
    throw new Error("contract explorer URL が一致しません");
  }
  if (record.explorer?.deployTransaction !== `https://sepolia.etherscan.io/tx/${expected.deployTransactionHash}`) {
    throw new Error("deploy explorer URL が一致しません");
  }
  const verification = record.verification;
  if (!verification) throw new Error("verification metadata がありません");
  for (const key of ["transactionHash", "from", "to", "chainId", "blockNumber", "status", "gasUsed", "lastValid", "lastCommitment"]) {
    if (verification[key] !== expected.verification[key]) {
      throw new Error(`verification.${key} が一致しません`);
    }
  }
  if (verification.to !== record.contractAddress) throw new Error("verification の送信先が contract と一致しません");
  if (verification.chainId !== record.chainId) throw new Error("verification の chainId が deployment と一致しません");
  if (verification.explorer !== `https://sepolia.etherscan.io/tx/${expected.verification.transactionHash}`) {
    throw new Error("verification explorer URL が一致しません");
  }
  if (record.timestamp !== undefined) throw new Error("deployment timestamp はこの記録にはありません");
}

function assertPublicProof(proof, record) {
  if (!Array.isArray(proof.publicSignals) || proof.publicSignals.length !== 1) {
    throw new Error("public proof の publicSignals は 1 個です");
  }
  if (!Array.isArray(proof.pubSignals) || proof.pubSignals.length !== 1) {
    throw new Error("public proof の pubSignals は 1 個です");
  }
  if (BigInt(proof.publicSignals[0]) !== BigInt(record.verification.lastCommitment)) {
    throw new Error("public proof の commitment が verification の記録と一致しません");
  }
  if (BigInt(proof.pubSignals[0]) !== BigInt(record.verification.lastCommitment)) {
    throw new Error("public proof の Solidity commitment が verification の記録と一致しません");
  }
  if (JSON.stringify(proof).toLowerCase().includes("secret")) {
    throw new Error("public proof に secret が含まれています");
  }
}

function readDeployment(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = {
  EXPECTED_DEPLOYMENT,
  assertDeploymentRecord,
  assertPublicProof,
  readDeployment,
};
