pragma circom 2.2.2;

include "poseidon.circom";
include "bitify.circom";
include "comparators.circom";

// Fixed four-step guest. This is not a general ZKVM, RISC Zero, or SP1.
// The instruction word is constant and matches DEFAULT_GUEST_PROGRAM:
// load input into r0, add immediate 1 into r1, halt, halt.
// When the sum fits in 64 bits, the final r1 is inputSecret + 1.
// Public journal: zkvmProgramId, inputRoot, outputCommitment, executionId.

function DOMAIN_INPUT() { return 19; }
function DOMAIN_INPUT_ROOT() { return 20; }
function DOMAIN_OUTPUT() { return 22; }
function DOMAIN_ZKVM_PROGRAM() { return 33; }

template Fit(n) {
    signal input in;
    component bits = Num2Bits(n);
    bits.in <== in;
}

template Step() {
    signal input priorHalt;
    signal input opcode;
    signal input imm;
    signal input r0;
    signal input r1;
    signal input inputSecret;
    signal output r0Out;
    signal output r1Out;
    signal output halted;

    component isLoad = IsEqual();
    isLoad.in[0] <== opcode;
    isLoad.in[1] <== 1;
    component isAdd = IsEqual();
    isAdd.in[0] <== opcode;
    isAdd.in[1] <== 2;
    component isHalt = IsEqual();
    isHalt.in[0] <== opcode;
    isHalt.in[1] <== 3;
    isLoad.out + isAdd.out + isHalt.out === 1;

    signal immBit;
    immBit <== imm * (imm - 1);
    immBit === 0;
    priorHalt * (opcode - 3) === 0;

    signal sum;
    sum <== r0 + imm;
    signal r1Delta;
    r1Delta <== sum - r1;
    signal r1Selected;
    r1Selected <== r1 + isAdd.out * r1Delta;
    signal r0Delta;
    r0Delta <== inputSecret - r0;
    signal r0Selected;
    r0Selected <== r0 + isLoad.out * r0Delta;

    signal r0Freeze;
    r0Freeze <== r0 - r0Selected;
    r0Out <== r0Selected + priorHalt * r0Freeze;
    signal r1Freeze;
    r1Freeze <== r1 - r1Selected;
    r1Out <== r1Selected + priorHalt * r1Freeze;
    component r0Bits = Fit(64);
    r0Bits.in <== r0Out;
    component r1Bits = Fit(64);
    r1Bits.in <== r1Out;

    halted <== priorHalt + isHalt.out - priorHalt * isHalt.out;
}

template Guest() {
    signal input inputSecret;
    signal input inputSalt;
    signal input outputSecret;
    signal input zkvmProgramId;
    signal input inputRoot;
    signal input outputCommitment;
    signal input executionId;

    // The program word is not a witness. These constraints pin every opcode and immediate.
    signal op0;
    op0 <== 1;
    signal imm0;
    imm0 <== 0;
    signal op1;
    op1 <== 2;
    signal imm1;
    imm1 <== 1;
    signal op2;
    op2 <== 3;
    signal imm2;
    imm2 <== 0;
    signal op3;
    op3 <== 3;
    signal imm3;
    imm3 <== 0;

    component inputBits = Fit(64);
    inputBits.in <== inputSecret;
    component executionBits = Fit(128);
    executionBits.in <== executionId;

    component step0 = Step();
    step0.priorHalt <== 0;
    step0.opcode <== op0;
    step0.imm <== imm0;
    step0.r0 <== 0;
    step0.r1 <== 0;
    step0.inputSecret <== inputSecret;

    component step1 = Step();
    step1.priorHalt <== step0.halted;
    step1.opcode <== op1;
    step1.imm <== imm1;
    step1.r0 <== step0.r0Out;
    step1.r1 <== step0.r1Out;
    step1.inputSecret <== inputSecret;

    component step2 = Step();
    step2.priorHalt <== step1.halted;
    step2.opcode <== op2;
    step2.imm <== imm2;
    step2.r0 <== step1.r0Out;
    step2.r1 <== step1.r1Out;
    step2.inputSecret <== inputSecret;

    component step3 = Step();
    step3.priorHalt <== step2.halted;
    step3.opcode <== op3;
    step3.imm <== imm3;
    step3.r0 <== step2.r0Out;
    step3.r1 <== step2.r1Out;
    step3.inputSecret <== inputSecret;
    step3.halted === 1;
    outputSecret === step3.r1Out;

    component inputHasher = Poseidon(2);
    inputHasher.inputs[0] <== DOMAIN_INPUT();
    inputHasher.inputs[1] <== inputSecret;
    component rootHasher = Poseidon(3);
    rootHasher.inputs[0] <== DOMAIN_INPUT_ROOT();
    rootHasher.inputs[1] <== inputHasher.out;
    rootHasher.inputs[2] <== inputSalt;
    inputRoot === rootHasher.out;

    component outputHasher = Poseidon(3);
    outputHasher.inputs[0] <== DOMAIN_OUTPUT();
    outputHasher.inputs[1] <== outputSecret;
    outputHasher.inputs[2] <== executionId;
    outputCommitment === outputHasher.out;

    component programHasher = Poseidon(10);
    programHasher.inputs[0] <== DOMAIN_ZKVM_PROGRAM();
    programHasher.inputs[1] <== 1;
    programHasher.inputs[2] <== op0;
    programHasher.inputs[3] <== imm0;
    programHasher.inputs[4] <== op1;
    programHasher.inputs[5] <== imm1;
    programHasher.inputs[6] <== op2;
    programHasher.inputs[7] <== imm2;
    programHasher.inputs[8] <== op3;
    programHasher.inputs[9] <== imm3;
    zkvmProgramId === programHasher.out;
}

component main {public [zkvmProgramId, inputRoot, outputCommitment, executionId]} = Guest();
