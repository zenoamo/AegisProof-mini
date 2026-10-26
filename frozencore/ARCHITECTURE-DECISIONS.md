# 段階的統合の決定

この文書は、2026-10-09 に採用した方針である。信号ごとの保証表は `FORMAL-SPEC-REVIEW.md` を正とし、ここには繰り返さない。本番用の鍵は作っていない。

## 採用したこと

段階的統合を使う。FrozenCore は AegisProof-mini の中の証明基盤であり、別リポジトリにはしない。

`frozencore/circuit/statement.circom` の 30 公開シグナル版を、正式な statement 仕様の候補にする。候補であることは、本番仕様として確定したことではない。外部検証の信頼の起点と、実行証明との接続が未確定だからである。

Statement、Guest、外部検証は別の責務である。Groth16 の成功は、外部の事実、guest の実行、署名の真正性を意味しない。

mini 0.1.0、mini 0.2.0、30 信号の statement、4 信号の guest は、世代として並置する。公開信号の式が違う回路を互換とは扱わない。0.1.0 をローカルで再び受け入れるかは未決定のままである。

`production: false` と、外部検証の `not-configured` は維持する。

## 責務

| 層 | いま保証すること | 保証しないこと |
| --- | --- | --- |
| statement 回路 | `FORMAL-SPEC-REVIEW.md` の表で整合とした制約。ハッシュの前像、ビット幅、`issuedAt < expiresAt`、`protocolVersion === 1`、深さ 1 の根 | 現在時刻、外部の失効集合と状態、署名、ZKVM 証明、アテステーション、guest の再実行 |
| 証明 API `statementFromParts` | 回路に渡す前の拒否。`programVersion` が 1、`outputSecret` が既定 guest の結果、渡された `zkvmProgramId` がその命令列のハッシュ | その拒否は回路制約ではない。手書きの witness は回路を通り得る |
| `verify` | 30 信号の Groth16 とスキーマと `production: false` | 外部検証 |
| `external.js` | 時刻の順序判定。未設定の検証は `verified: false` | 信頼する時計、失効権限、署名、ZKVM、アテステーション |
| guest 回路 | 命令集合、停止、三つのハッシュ。命令列は秘密入力。証明鍵は無い | 既定命令列の固定。statement への再実行 |

要確認の三点は候補のまま残す。`programVersion` の 1 固定、`outputSecret` と guest 実行、`zkvmProgramId` と命令列は、API にはあり回路の statement には無い。

## 正式仕様にする前の条件

次が揃うまで、本番仕様としての採用は完了にしない。

| 条件 | 現状 |
| --- | --- |
| statement の目的と保証範囲が書かれている | 候補として書かれている。本番範囲は未確定 |
| スキーマ、回路、API、文書の対応 | 名前と順序は一致。API が回路より厳しい三点は未解消 |
| Statement と Guest の責務 | 分離を維持する。第一候補は両方の証明を必須とする独立検証。仕様は `GUEST-INDEPENDENT-VERIFICATION.md`。回路と鍵は未変更 |
| 外部検証の信頼の起点 | 未定義。`not-configured` |
| 実装済みと未実装の区別 | `FORMAL-SPEC-REVIEW.md` と `external.js` にある |
| 既存世代との互換性 | 互換ではないと文書化済み。0.1.0 のローカル再受け入れは未決定 |
| 本番セレモニーの対象回路 | 未確定。30 信号版とは決めない |

## 本番セレモニーとの差

`CEREMONY-PLAN.md` は、本番鍵を作らない条件の一つに「30 信号版を、どの利用でも正式な文にするか」を残している。今回の方針は、その問いの一部だけを決める。正式な statement の候補にはする。すべての利用の唯一の文にはしない。本番セレモニーの対象回路にもしない。

計画の「対象が決まるまで本番用の Powers of Tau と zkey を作らない」は、この方針と矛盾しない。開発用の `statement.zkey` を本番鍵にしない、という記述も維持する。

## 追記: 独立検証の実装前仕様

2026-10-09 に、Guest と Statement の独立証明を実装前仕様として書いた。本文は `GUEST-INDEPENDENT-VERIFICATION.md` である。

決めたことは、両方の証明を必須にすること、公開値の照合を Groth16 検証から分けること、外部検証が未設定なら全体を検証済みにしないこと、Guest を既定命令列の専用回路として設計することである。現行の `guest.circom` は命令列を固定していない。固定は提案であり、回路はまだ変えていない。Guest の鍵は、その回路が仕様と一致するまで作らない。Statement の鍵は Guest に使わない。

`programVersion` を回路で 1 に固定するか、外部検証の信頼の起点、本番セレモニーの対象回路は、未確定のままである。
