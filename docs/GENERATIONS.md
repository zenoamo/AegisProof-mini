# 世代と検証鍵

この文書は、作業ツリーとコミット `90df4d2` から確認できた対応だけを書く。

## 受け入れ

リポジトリ直下の `circuit/`、`keys/`、`artifacts/` は、コミット `90df4d2` の mini 0.1.0 である。ルートの検証器はこの 1 信号だけを受け入れる。

mini 0.2.0 は `experimental/mini-0.2.0/` に保全してある。正式採用は未決定である。対応する ptau は無く、`zkey verify r1cs` は未完了である。ルートの検証器は、この 5 信号の鍵で証明を検査しない。

Sepolia に記録されたコントラクトは公開信号 1 個のままである。5 信号の verifier はデプロイされていない。

## 確認できた世代

| 世代 | 公開信号 | 回路の制約 | 検証鍵 | 作業ツリーでの検証 |
| --- | --- | --- | --- | --- |
| mini 0.1.0 | `commitment` の 1 個 | `commitment === Poseidon(secret)`。秘密入力は `secret` のみ。コミット `90df4d2` の `circuit/main.circom` | 直下の `keys/verification_key.json`。`nPublic` は 1、`IC` は 2 | ルートの検証器がする |
| mini 0.2.0 | 5 個。`commitment`、`nullifier`、`contextHash`、`policyId`、`epoch` | `experimental/mini-0.2.0/circuit/main.circom` | `experimental/mini-0.2.0/keys/verification_key.json`。`nPublic` は 5、`IC` は 6。セレモニー検証は未完了 | ルートの検証器はしない。実験ツリーの検証器だけが対象 |
| 実験 30 信号 | `frozencore/schema/public-signals-v1.json` の 30 個 | `frozencore/circuit/statement.circom`。開発用 manifest の制約数は 13082 | 実行鍵は `frozencore/dev/statement/verification_key.json`。`nPublic` は 30、`IC` は 31。`frozencore/keys/statement_verification_key.json` はレガシーで、実行経路は使わない | `verifyStatement` がする。スキーマ `frozencore-public-signals-v1`。0.2.0 の証明ではない。正式採用は未決定 |
| guest | 4 個。`zkvmProgramId`、`inputRoot`、`outputCommitment`、`executionId` | `frozencore/circuit/guest.circom`。開発用 manifest の制約数は 3942 | `frozencore/dev/guest/verification_key.json`。`nPublic` は 4、`IC` は 5 | 専用の guest 検証器ではできる。`verifyStatement` は選ばない |

0.1.0 と 0.2.0 は、どちらも commitment に `Poseidon(secret)` を使う。0.2.0 は nullifier と context を追加している。公開信号の本数も検証鍵も違う。0.2.0 の証明は 0.1.0 の証明として検証できず、その逆もできない。

実験 30 信号の commitment は `Poseidon(16, secret)` なので、0.1.0 や 0.2.0 の commitment とも一致しない。
