pragma circom 2.2.2;

include "poseidon.circom";

// AegisProof mini の最小ステートメント。
// private: secret
// public:  commitment
// constraint: commitment === Poseidon(secret)
//
// ASSUMPTION: 回路内ハッシュは Poseidon(1)。SHA-256 は R1CS が大きくなるため、
// 成果物完全性レイヤ側でのみ使う。publicSignals は [commitment] の 1 個だけ。
template Commitment() {
    signal input secret;
    signal input commitment;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== secret;
    commitment === hasher.out;
}

component main {public [commitment]} = Commitment();
