pragma circom 2.2.2;

include "poseidon.circom";
include "bitify.circom";
include "comparators.circom";

// FrozenCore experimental statement.
// This file does not replace circuit/main.circom.
// Domain tags match frozencore/schema/domains.json.
//
// zkvmProofCommitment and attestationCommitment bind public tuples.
// They do not verify a ZKVM proof or a TEE attestation.

function DOMAIN_COMMITMENT() { return 16; }
function DOMAIN_SUBJECT() { return 17; }
function DOMAIN_CONTEXT() { return 18; }
function DOMAIN_INPUT() { return 19; }
function DOMAIN_INPUT_ROOT() { return 20; }
function DOMAIN_AUTH() { return 21; }
function DOMAIN_OUTPUT() { return 22; }
function DOMAIN_PROGRAM() { return 23; }
function DOMAIN_NULLIFIER() { return 24; }
function DOMAIN_SEPARATOR() { return 25; }
function DOMAIN_REV_LEAF() { return 26; }
function DOMAIN_STATE_LEAF() { return 27; }
function DOMAIN_MERKLE() { return 28; }
function DOMAIN_RUNTIME() { return 29; }
function DOMAIN_ATTEST() { return 30; }
function DOMAIN_ZKVM_BIND() { return 31; }

template Fit(n) {
    signal input in;
    component bits = Num2Bits(n);
    bits.in <== in;
}

template Bit() {
    signal input in;
    signal zero;
    zero <== in * (in - 1);
    zero === 0;
}

template Depth1() {
    signal input leaf;
    signal input sibling;
    signal input pathBit;
    signal output root;

    component bit = Bit();
    bit.in <== pathBit;

    signal left;
    signal right;
    left <== leaf + pathBit * (sibling - leaf);
    right <== sibling + pathBit * (leaf - sibling);

    component hasher = Poseidon(3);
    hasher.inputs[0] <== DOMAIN_MERKLE();
    hasher.inputs[1] <== left;
    hasher.inputs[2] <== right;
    root <== hasher.out;
}

template Statement() {
    signal input secret;
    signal input context;
    signal input subjectNonce;
    signal input inputSecret;
    signal input inputSalt;
    signal input authSecret;
    signal input outputSecret;
    signal input programBody;
    signal input revocationSibling;
    signal input revocationPathBit;
    signal input stateSibling;
    signal input statePathBit;
    signal input runtimeConfigWord;

    signal input commitment;
    signal input nullifier;
    signal input contextHash;
    signal input subjectCommitment;
    signal input inputCommitment;
    signal input policyId;
    signal input policyVersion;
    signal input authorizationCommitment;
    signal input issuerId;
    signal input audienceId;
    signal input epoch;
    signal input issuedAt;
    signal input expiresAt;
    signal input revocationRoot;
    signal input stateRoot;
    signal input programHash;
    signal input programVersion;
    signal input inputRoot;
    signal input outputCommitment;
    signal input executionId;
    signal input zkvmProgramId;
    signal input zkvmProofCommitment;
    signal input teeMeasurement;
    signal input attestationCommitment;
    signal input runtimeConfigHash;
    signal input verifierId;
    signal input protocolVersion;
    signal input chainId;
    signal input contractAddressField;
    signal input domainSeparator;

    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== DOMAIN_COMMITMENT();
    commitHasher.inputs[1] <== secret;
    commitment === commitHasher.out;

    component subjectHasher = Poseidon(3);
    subjectHasher.inputs[0] <== DOMAIN_SUBJECT();
    subjectHasher.inputs[1] <== secret;
    subjectHasher.inputs[2] <== subjectNonce;
    subjectCommitment === subjectHasher.out;

    component contextHasher = Poseidon(2);
    contextHasher.inputs[0] <== DOMAIN_CONTEXT();
    contextHasher.inputs[1] <== context;
    contextHash === contextHasher.out;

    component inputHasher = Poseidon(2);
    inputHasher.inputs[0] <== DOMAIN_INPUT();
    inputHasher.inputs[1] <== inputSecret;
    inputCommitment === inputHasher.out;

    component inputRootHasher = Poseidon(3);
    inputRootHasher.inputs[0] <== DOMAIN_INPUT_ROOT();
    inputRootHasher.inputs[1] <== inputCommitment;
    inputRootHasher.inputs[2] <== inputSalt;
    inputRoot === inputRootHasher.out;

    component policyBits = Fit(128);
    policyBits.in <== policyId;
    component policyVersionBits = Fit(128);
    policyVersionBits.in <== policyVersion;
    component issuerBits = Fit(160);
    issuerBits.in <== issuerId;
    component audienceBits = Fit(160);
    audienceBits.in <== audienceId;

    component authHasher = Poseidon(6);
    authHasher.inputs[0] <== DOMAIN_AUTH();
    authHasher.inputs[1] <== authSecret;
    authHasher.inputs[2] <== policyId;
    authHasher.inputs[3] <== policyVersion;
    authHasher.inputs[4] <== issuerId;
    authHasher.inputs[5] <== audienceId;
    authorizationCommitment === authHasher.out;

    component epochBits = Fit(64);
    epochBits.in <== epoch;
    component issuedBits = Fit(64);
    issuedBits.in <== issuedAt;
    component expiresBits = Fit(64);
    expiresBits.in <== expiresAt;
    component timeOrder = LessThan(64);
    timeOrder.in[0] <== issuedAt;
    timeOrder.in[1] <== expiresAt;
    timeOrder.out === 1;

    component revLeaf = Poseidon(3);
    revLeaf.inputs[0] <== DOMAIN_REV_LEAF();
    revLeaf.inputs[1] <== subjectCommitment;
    revLeaf.inputs[2] <== 0;
    component revTree = Depth1();
    revTree.leaf <== revLeaf.out;
    revTree.sibling <== revocationSibling;
    revTree.pathBit <== revocationPathBit;
    revocationRoot === revTree.root;

    component stateLeaf = Poseidon(3);
    stateLeaf.inputs[0] <== DOMAIN_STATE_LEAF();
    stateLeaf.inputs[1] <== subjectCommitment;
    stateLeaf.inputs[2] <== epoch;
    component stateTree = Depth1();
    stateTree.leaf <== stateLeaf.out;
    stateTree.sibling <== stateSibling;
    stateTree.pathBit <== statePathBit;
    stateRoot === stateTree.root;

    component programVersionBits = Fit(64);
    programVersionBits.in <== programVersion;
    programVersion === 1;
    component programHasher = Poseidon(4);
    programHasher.inputs[0] <== DOMAIN_PROGRAM();
    programHasher.inputs[1] <== programVersion;
    programHasher.inputs[2] <== programBody;
    programHasher.inputs[3] <== zkvmProgramId;
    programHash === programHasher.out;

    component executionBits = Fit(128);
    executionBits.in <== executionId;
    component outputHasher = Poseidon(3);
    outputHasher.inputs[0] <== DOMAIN_OUTPUT();
    outputHasher.inputs[1] <== outputSecret;
    outputHasher.inputs[2] <== executionId;
    outputCommitment === outputHasher.out;

    component zkvmHasher = Poseidon(5);
    zkvmHasher.inputs[0] <== DOMAIN_ZKVM_BIND();
    zkvmHasher.inputs[1] <== zkvmProgramId;
    zkvmHasher.inputs[2] <== inputRoot;
    zkvmHasher.inputs[3] <== outputCommitment;
    zkvmHasher.inputs[4] <== executionId;
    zkvmProofCommitment === zkvmHasher.out;

    component runtimeHasher = Poseidon(2);
    runtimeHasher.inputs[0] <== DOMAIN_RUNTIME();
    runtimeHasher.inputs[1] <== runtimeConfigWord;
    runtimeConfigHash === runtimeHasher.out;

    component attestHasher = Poseidon(5);
    attestHasher.inputs[0] <== DOMAIN_ATTEST();
    attestHasher.inputs[1] <== teeMeasurement;
    attestHasher.inputs[2] <== runtimeConfigHash;
    attestHasher.inputs[3] <== outputCommitment;
    attestHasher.inputs[4] <== executionId;
    attestationCommitment === attestHasher.out;

    component verifierBits = Fit(128);
    verifierBits.in <== verifierId;
    component chainBits = Fit(64);
    chainBits.in <== chainId;
    component addressBits = Fit(160);
    addressBits.in <== contractAddressField;
    protocolVersion === 1;

    component domainHasher = Poseidon(5);
    domainHasher.inputs[0] <== DOMAIN_SEPARATOR();
    domainHasher.inputs[1] <== protocolVersion;
    domainHasher.inputs[2] <== chainId;
    domainHasher.inputs[3] <== contractAddressField;
    domainHasher.inputs[4] <== verifierId;
    domainSeparator === domainHasher.out;

    component nullifierHasher = Poseidon(8);
    nullifierHasher.inputs[0] <== DOMAIN_NULLIFIER();
    nullifierHasher.inputs[1] <== secret;
    nullifierHasher.inputs[2] <== contextHash;
    nullifierHasher.inputs[3] <== policyId;
    nullifierHasher.inputs[4] <== policyVersion;
    nullifierHasher.inputs[5] <== epoch;
    nullifierHasher.inputs[6] <== executionId;
    nullifierHasher.inputs[7] <== domainSeparator;
    nullifier === nullifierHasher.out;
}

component main {public [
    commitment,
    nullifier,
    contextHash,
    subjectCommitment,
    inputCommitment,
    policyId,
    policyVersion,
    authorizationCommitment,
    issuerId,
    audienceId,
    epoch,
    issuedAt,
    expiresAt,
    revocationRoot,
    stateRoot,
    programHash,
    programVersion,
    inputRoot,
    outputCommitment,
    executionId,
    zkvmProgramId,
    zkvmProofCommitment,
    teeMeasurement,
    attestationCommitment,
    runtimeConfigHash,
    verifierId,
    protocolVersion,
    chainId,
    contractAddressField,
    domainSeparator
]} = Statement();
