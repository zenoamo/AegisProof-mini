# FrozenCore 実験回路の仕様

版: `frozencore-experimental-0.1.0`。スキーマ: `frozencore-public-signals-v1`。本番化はしない。

このファイルの対象は実験回路 `circuit/statement.circom` であり、30 公開シグナルを唯一の正式仕様にはしない。同じリポジトリの mini 0.2.0 は別の 5 信号文で、接続口は `src/foundation.js` の `verifyStatement` である。mini の commitment は `Poseidon(secret)`、この回路は `Poseidon(16, secret)` なので、証明は交換できない。`circuit/guest.circom` は 4 公開シグナルの別回路で、30 シグナル版の証明ではない。この statement のビルド手順は guest の proving key を作らない。guest の開発用鍵は別経路で `frozencore/dev/guest/` にあり、`verifyStatement` は guest を選ばない。外部検証は `src/external.js` にあり、時計、失効権限、署名、ZKVM、アテステーションは未設定のまま `verified: false` を返す。Groth16 の成功はそれらを検証済みにしない。世代は `docs/GENERATIONS.md`、本番セレモニーの計画は `CEREMONY-PLAN.md` にあり、本番鍵は作っていない。

公開信号は BN254 スカラーの正規十進文字列である。型はすべてフィールド要素で、先頭ゼロは拒否する。バイト列そのものを公開信号にはしない。

## 回路が実際に拘束していること

`statement.sym` の公開入力 1 から 30 は、下の順序と一致している。開発用マニフェストの R1CS は制約 13082、公開入力 30、非公開入力 13。

| # | 名前 | 生成 | 回路の制約 | 検証していないこと |
| --- | --- | --- | --- | --- |
| 1 | commitment | Poseidon(16, secret) | 等号 | 秘密の正しさ以外 |
| 2 | nullifier | Poseidon(24, secret, contextHash, policyId, policyVersion, epoch, executionId, domainSeparator) | 等号 | 契約上の使用済み検査は無い |
| 3 | contextHash | Poseidon(18, context) | 等号 | context の意味 |
| 4 | subjectCommitment | Poseidon(17, secret, subjectNonce) | 等号 | 主体の実在 |
| 5 | inputCommitment | Poseidon(19, inputSecret) | 等号 | 入力の真正性 |
| 6 | policyId | 証明者が供給。128 bit 以内 | 範囲と auth、nullifier への束縛 | ポリシー本文 |
| 7 | policyVersion | 証明者が供給。128 bit 以内 | 範囲と auth、nullifier への束縛 | 版の承認 |
| 8 | authorizationCommitment | Poseidon(21, authSecret, policyId, policyVersion, issuerId, audienceId) | 等号 | 署名も承認も検証しない |
| 9 | issuerId | 証明者が供給。160 bit 以内 | 範囲と auth への束縛 | 発行者の署名 |
| 10 | audienceId | 証明者が供給。160 bit 以内 | 範囲と auth への束縛 | 呼び出し元との一致。契約は無い |
| 11 | epoch | 証明者が供給。64 bit 以内 | 範囲、state leaf、nullifier | 現在の epoch |
| 12 | issuedAt | 証明者が供給。64 bit 以内 | 範囲と issuedAt < expiresAt | 壁時計 |
| 13 | expiresAt | 証明者が供給。64 bit 以内 | 範囲と上記の順序 | 現在時刻との比較 |
| 14 | revocationRoot | 深さ 1 の木。葉は Poseidon(26, subjectCommitment, 0) | 葉と sibling から根を計算 | 外部の失効集合。証明者が sibling を選べる |
| 15 | stateRoot | 葉は Poseidon(27, subjectCommitment, epoch) | 深さ 1 の包含 | 外部状態。証明者が sibling を選べる |
| 16 | programHash | Poseidon(23, programVersion, programBody, zkvmProgramId) | 等号 | プログラムの実行 |
| 17 | programVersion | 証明者が供給。64 bit 以内 | 範囲、`programVersion === 1`、programHash への束縛 | guest の program id に使うリテラル 1 と同一の意味であること。外部の版台帳 |
| 18 | inputRoot | Poseidon(20, inputCommitment, inputSalt) | 等号 | inputCommitment とは別値 |
| 19 | outputCommitment | Poseidon(22, outputSecret, executionId) | 等号 | guest の実行結果。回路は outputSecret を再実行しない |
| 20 | executionId | 証明者が供給。128 bit 以内 | 範囲、output、nullifier、束縛ハッシュ | 実行の一意性。使用済み検査は無い |
| 21 | zkvmProgramId | API が guest 命令列の Poseidon(33, 1, opcodes) として計算 | programHash と zkvm 束縛への入力 | guest 証明の検証 |
| 22 | zkvmProofCommitment | Poseidon(31, zkvmProgramId, inputRoot, outputCommitment, executionId) | 等号 | ZKVM 証明そのもの |
| 23 | teeMeasurement | 証明者が供給するフィールド要素 | attestation 束縛への入力 | 計測値の真正性 |
| 24 | attestationCommitment | Poseidon(30, teeMeasurement, runtimeConfigHash, outputCommitment, executionId) | 等号 | アテステーション検証 |
| 25 | runtimeConfigHash | Poseidon(29, runtimeConfigWord) | 等号 | 実行環境の設定 |
| 26 | verifierId | 証明者が供給。128 bit 以内 | 範囲と domainSeparator | 検証器の実体 |
| 27 | protocolVersion | 定数 1 | `protocolVersion === 1` と domainSeparator | |
| 28 | chainId | 証明者が供給。64 bit 以内 | 範囲と domainSeparator | 実行中の chain id。契約は無い |
| 29 | contractAddressField | 証明者が供給。160 bit 以内 | 範囲と domainSeparator | 実際のコントラクトアドレス |
| 30 | domainSeparator | Poseidon(25, protocolVersion, chainId, contractAddressField, verifierId) | 等号と nullifier への入力 | 環境との照合。契約は無い |

非公開入力は secret、context、subjectNonce、inputSecret、inputSalt、authSecret、outputSecret、programBody、revocationSibling、revocationPathBit、stateSibling、statePathBit、runtimeConfigWord。

## API が回路より厳しく拒否するもの

`statementFromParts` は次を回路に渡す前に拒否する。これは回路制約ではない。

- `programVersion` が 1 でない
- `outputSecret` が、固定 4 命令 guest（load、add 1、halt、halt）の結果と違う
- 呼び出し側が渡した `zkvmProgramId` が、その命令列のハッシュと違う

`programVersion === 1` は回路制約である。手動で witness を組んでも、1 以外は制約を満たさない。`outputSecret` は statement 回路が guest を再実行して検査するものではない。検証 API は Groth16 の成否だけを見る。

## 重なり

`inputCommitment` は入力の葉、`inputRoot` はその葉と salt のハッシュである。`programHash` は版、非公開の programBody、`zkvmProgramId` をまとめた値で、`zkvmProgramId` 自体ではない。`zkvmProofCommitment` と `attestationCommitment` はタプルのハッシュであり、それぞれの外部証明の検証結果ではない。`domainSeparator` は四つの公開値から導出する。四つを残してあるので、将来の契約が Poseidon を再計算せずに環境と比較できる。このリポジトリにはその契約は無い。

## セレモニー

成果物は `frozencore/` だけに書く。mini の `circuit/mini.zkey` と `keys/verification_key.json` は使わない。単一貢献者の開発用セットアップであり、複数人のセレモニーではない。毒性パラメータの破棄は証明されない。`setup/statement/pot_final.ptau` を残し、`zkey verify` に相当する `verifyFromR1cs` をビルドが実行した場合だけ、その結果を `PROVENANCE.md` に書く。
