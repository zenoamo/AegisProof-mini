pragma circom 2.2.2;

include "poseidon.circom";

// AegisProof mini statement.
// private: secret, context
// public:  commitment, nullifier, contextHash, policyId, epoch
//
// CONTEXT_DOMAIN is 2. NULLIFIER_DOMAIN is 3.
// These tags match src/statement.js. They are not secret.
//
// The circuit guarantees:
//   commitment  === Poseidon(secret)
//   contextHash === Poseidon(CONTEXT_DOMAIN, context)
//   nullifier   === Poseidon(NULLIFIER_DOMAIN, secret, contextHash, policyId, epoch)
//
// policyId is bound into the nullifier. This does not prove that a policy rule holds.
// epoch is bound into the nullifier. This does not prove that the epoch is current.
template Statement() {
    signal input secret;
    signal input context;
    signal input commitment;
    signal input nullifier;
    signal input contextHash;
    signal input policyId;
    signal input epoch;

    component commitHasher = Poseidon(1);
    commitHasher.inputs[0] <== secret;
    commitment === commitHasher.out;

    component contextHasher = Poseidon(2);
    contextHasher.inputs[0] <== 2;
    contextHasher.inputs[1] <== context;
    contextHash === contextHasher.out;

    component nullifierHasher = Poseidon(5);
    nullifierHasher.inputs[0] <== 3;
    nullifierHasher.inputs[1] <== secret;
    nullifierHasher.inputs[2] <== contextHash;
    nullifierHasher.inputs[3] <== policyId;
    nullifierHasher.inputs[4] <== epoch;
    nullifier === nullifierHasher.out;
}

component main {public [commitment, nullifier, contextHash, policyId, epoch]} = Statement();
