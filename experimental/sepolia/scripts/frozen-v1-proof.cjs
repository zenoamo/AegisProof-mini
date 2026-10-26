const fs = require("node:fs");
const path = require("node:path");

function loadFrozenV1Proof() {
  const proof = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/public-proof.json"), "utf8"),
  );
  if (!Array.isArray(proof.pubSignals) || proof.pubSignals.length !== 1) {
    throw new Error("凍結した v1 証明の公開信号は 1 個である必要があります");
  }
  return {
    args: {
      pA: proof.pA,
      pB: proof.pB,
      pC: proof.pC,
      pubSignals: proof.pubSignals,
    },
  };
}

module.exports = { loadFrozenV1Proof };
