# 外部 trust anchor の未決定事項

記録日: 2026-10-09。6 項目とも信頼元は未設定である。この文書は方式を選定しない。`src/external.js` は各項目を `not-configured` と `verified: false` で返す。未設定、欠落、拒否、例外を成功にはしない。

実装済みのインターフェースは `externalReport` である。本番モードではテスト検証器を呼び出さず、`reason` は `test-verifier-forbidden` になる。`reviewPair` の `externallyComplete` は、6 項目がすべて `verified`、`status`、`outcome` が verified で、mock でないときだけ true になる。`verified` はそれに加え、両方の Groth16、公開値の一致、結合条件が揃ったときだけ true になる。

どの項目も、次が決まるまで検証器を追加しない。

- 信頼する情報源と、その鍵または証明書の保管者
- 暗号方式
- 検証するバイト列と、Statement のどの公開値に結合するか
- 新鮮さ、期限、再送の規則
- タイムアウトと、到達不能のときの失敗
- 本番設定と開発設定を取り違えない配置

障害時は `verified: false` のままにする。タイムアウトを成功にしない。

## 時刻

検証したいものは、`expiresAt` が信頼できる現在時刻より前でないことである。回路は `issuedAt < expiresAt` の整数比較しかしない。`checkTimeOrder` はその順序だけで、`verified` は false のままである。

決めるもの: 時計の識別子、許容誤差、再送窓、時計が止まったときの動作。候補は、運用者が選ぶ単一の NTP 源、または複数源の合意である。どちらも未選定である。ローカル時計を本番の信頼元にすると、証明を作るマシンの時刻改ざんを検出できない。

## 失効

検証したいものは、主体が信頼できる失効集合に無いことである。回路の `revocationRoot` は、証明者が選んだ深さ 1 の sibling から計算される。

決めるもの: 失効権限者、署名された集合の形式、更新間隔と集合の期限。根の一致だけでは、その根を誰が署名したかは分からない。

## 状態

検証したいものは、`stateRoot` が信頼できる状態機関の現在の根と一致し、その根が新鮮であることである。回路は証明者の選んだ sibling で包含を計算する。

決めるもの: 状態機関、根への署名、新鮮さの規則。`epoch` が回路に入っていることは、その epoch が現在であることではない。

## 署名

検証したいものは、信頼する鍵による承認の署名である。回路の `authorizationCommitment` は Poseidon(21, authSecret, policyId, policyVersion, issuerId, audienceId) である。署名値のハッシュを、署名検証の成功とは扱わない。

決めるもの: 署名アルゴリズム、信頼する公開鍵の配布、署名対象にどの公開信号を含めるか。アルゴリズムをこのリポジトリ側で決めると、既存の発行者が使っていない方式を本物の承認として扱う危険がある。

## ZKVM

検証したいものは、実行の ZKVM 証明である。`zkvmProofCommitment` は四つの公開値の Poseidon 結合である。Guest は固定 4 命令の Groth16 であり、RISC Zero や SP1 の検証器ではない。結合の一致を ZKVM 検証とは呼ばない。

決めるもの: 検証器の実装、プログラム識別子、ジャーナルと `inputRoot`、`outputCommitment`、`executionId` の結合。Guest の Groth16 を ZKVM 証明の代わりにすることは、別の決定である。現状の Guest 鍵は開発用である。

## attestation

検証したいものは、ハードウェアの quote である。`attestationCommitment` は計測値、設定ハッシュ、出力、実行 ID の結合である。ハッシュが一致しても quote の真正性にはならない。ローカル TEE の実験実装は通常の Node プロセスであり、ハードウェアの信頼元ではない。

決めるもの: quote の形式、製造者または運用者の信頼の起点、測定値ポリシー、quote の新鮮さ。起点を仮に置くと、測定していない環境を attestation 済みにできる。
