# 0.2.0 のセレモニー状態

- 世代: `aegisproof-mini-0.2.0`
- 公開信号: 5（`commitment`、`nullifier`、`contextHash`、`policyId`、`epoch`）
- 制約数: 1767
- 検証鍵: `nPublic` 5、IC 6
- `ceremony.production`: false
- 貢献者の記録: manifest 上は 1。複数貢献者の transcript は無い
- 対応 ptau: このディレクトリにもリポジトリの他の場所にも無い
- `zkey verify r1cs`: 未実行。対応 ptau が無いため実行できない
- 独立したセレモニー検証: 未完了

`frozencore/` の ptau は 30 信号または guest 用であり、この zkey の検証には使いません。
