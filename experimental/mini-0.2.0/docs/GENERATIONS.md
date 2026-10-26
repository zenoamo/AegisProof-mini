# 世代と検証鍵

この文書は、作業ツリーとコミット `90df4d2` から確認できた対応だけを書く。

## 受け入れ

mini 0.1.0 を、いまのローカル検証器で受け入れるかは **未決定** である。

作業ツリーの検証器は 0.1.0 を拒否する。これは現行コードの動作であり、0.2.0 の検証鍵で 0.1.0 を通すという意味ではない。Sepolia に記録されたコントラクトは公開信号 1 個のままなので、チェーン上の検証と、この作業ツリーの検証は別経路である。

未決定の選択肢は次の二つである。

1. ローカルでは 0.1.0 を受け取らない。歴史的な証明の再検証は、デプロイ済みコントラクトの読み取り検証に限る。0.2.0 の鍵は使わない。
2. `90df4d2` の回路と検証鍵を、0.2.0 とは別のディレクトリへ複製し、その鍵だけを使う検証経路を足す。作業ツリーの `circuit/mini.zkey` と `keys/verification_key.json` は上書きしない。

2 を選ぶ利用要件は、このリポジトリの文書と呼び出し経路からは確定できない。複製はしていない。

## 確認できた世代

| 世代 | 公開信号 | 回路の制約 | 検証鍵 | 作業ツリーでの検証 |
| --- | --- | --- | --- | --- |
| mini 0.1.0 | `commitment` の 1 個 | `commitment === Poseidon(secret)`。秘密入力は `secret` のみ。コミット `90df4d2` の `circuit/main.circom` | 同コミットの verification key。`nPublic` は 1、`IC` は 2 | しない。鍵ファイルは作業ツリーでは 0.2.0 に置き換わっている |
| mini 0.2.0 | 5 個。`commitment`、`nullifier`、`contextHash`、`policyId`、`epoch` | `Poseidon(secret)`、`Poseidon(2, context)`、`Poseidon(3, secret, contextHash, policyId, epoch)` | `keys/verification_key.json`。`nPublic` は 5 | する。スキーマ `aegisproof-mini-public-signals-v2` |
| 実験 30 信号 | `frozencore/schema/public-signals-v1.json` の 30 個 | `frozencore/circuit/statement.circom`。開発用 manifest の制約数は 13082 | 実行鍵は `frozencore/dev/statement/verification_key.json`。`nPublic` は 30、`IC` は 31。`frozencore/keys/statement_verification_key.json` はレガシーで、実行経路は使わない | `verifyStatement` がする。スキーマ `frozencore-public-signals-v1`。0.2.0 の証明ではない。正式採用は未決定 |
| guest | 4 個。`zkvmProgramId`、`inputRoot`、`outputCommitment`、`executionId` | `frozencore/circuit/guest.circom`。開発用 manifest の制約数は 3942 | `frozencore/dev/guest/verification_key.json`。`nPublic` は 4、`IC` は 5 | 専用の guest 検証器ではできる。`verifyStatement` は選ばない |

0.1.0 と 0.2.0 は、どちらも commitment に `Poseidon(secret)` を使う。0.2.0 は nullifier と context を追加している。公開信号の本数も検証鍵も違う。0.2.0 の証明は 0.1.0 の証明として検証できず、その逆もできない。

実験 30 信号の commitment は `Poseidon(16, secret)` なので、0.1.0 や 0.2.0 の commitment とも一致しない。
