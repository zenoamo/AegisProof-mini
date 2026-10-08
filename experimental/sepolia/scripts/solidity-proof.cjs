async function toSolidityArgs(proof, publicSignals) {
  const snarkjs = await import("snarkjs");
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const parsed = JSON.parse(`[${calldata}]`);
  if (!Array.isArray(parsed) || parsed.length !== 4) {
    throw new Error("Solidity calldata の要素数が不正です");
  }
  const [pA, pB, pC, pubSignals] = parsed;
  if (!Array.isArray(pA) || pA.length !== 2) throw new Error("pA の形式が不正です");
  if (!Array.isArray(pB) || pB.length !== 2 || pB[0].length !== 2 || pB[1].length !== 2) {
    throw new Error("pB の形式が不正です");
  }
  if (!Array.isArray(pC) || pC.length !== 2) throw new Error("pC の形式が不正です");
  if (!Array.isArray(pubSignals) || pubSignals.length !== 1) {
    throw new Error("publicSignals は 1 個である必要があります");
  }
  return { pA, pB, pC, pubSignals };
}

module.exports = { toSolidityArgs };
