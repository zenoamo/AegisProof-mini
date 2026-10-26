# AegisProof-mini 0.2.0（実験世代）

このディレクトリは `aegisproof-mini-0.2.0` の独立した実験世代です。リポジトリ直下の `circuit/`、`keys/`、`artifacts/` は正式世代 `aegisproof-mini-0.1.0` であり、ここへ混ぜません。

公開信号は `commitment`、`nullifier`、`contextHash`、`policyId`、`epoch` の 5 個です。`ceremony.production` は false です。この zkey に対応する ptau とセレモニー transcript は無く、`zkey verify r1cs` は未完了です。ハッシュの自己一致や R1CS / WASM の再コンパイル一致は、セレモニーの検証ではありません。

正式採用は未決定です。Sepolia の既存コントラクトは 1 信号用であり、この検証鍵のデプロイ先ではありません。

`scripts/build.js` は、保存済み zkey を上書きし ptau を残さないため、既定では実行できません。
