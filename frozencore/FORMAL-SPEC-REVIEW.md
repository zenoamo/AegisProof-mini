# 正式仕様に向けた設計レビュー

記録日: 2026-10-09。対象は作業ツリー。この文書は調査結果であり、採用決定ではない。

2026-10-23 の注記: このレビューのあと、実行用の開発鍵は `frozencore/dev/statement/` と `frozencore/dev/guest/` に置かれている。`frozencore/artifacts/` と `frozencore/keys/` はレガシーである。guest の proving key が無い、という当時の文は現在のファイル配置と違う。正式採用、外部 trust anchor、guest を statement の一部とみなすかは未決定のままである。以下の本文は、その時点の調査記録として残す。

追記: この調査のあと、独立証明を第一候補とする実装前仕様を `GUEST-INDEPENDENT-VERIFICATION.md` に書いた。以下の表は、その仕様へ回路を変える前のソースに対する記録のままである。

回路、鍵、証明 API、検証 API、既存テストは変更していない。ビルドとセットアップは実行していない。テストスイートも実行していない。公開信号の順序は、スキーマと `frozencore/artifacts/statement.sym` の先頭 30 行を読んで照合した。

結論: 30 公開シグナル版は、名前と順序と Groth16 の文としては一貫している。正式な statement 仕様として採用するには、外部検証の信頼の起点と、guest を回路の一部とみなすかどうかが未決定である。現状のままでは、期限、失効、承認、ZKVM、アテステーションを証明したことにはならない。

## 照合した対応

スキーマ `frozencore/schema/public-signals-v1.json` の `order`、`statement.sym` の `main.*` 1 から 30、`circuit/statement.circom` の `public [...]` は、同じ 30 名が同じ順である。型はすべて BN254 のフィールド要素である。API は正規十進だけを受け、先頭ゼロを拒否する。スキーマ JSON は順序と版だけを持ち、各信号の意味は持たない。意味の記述は `SPEC.md` と回路と `src/statement.js` にある。

`src/verify.js` は Groth16 とスキーマと `production: false` だけを見る。`src/external.js` は呼ばない。`src/review.js` は両方を返すが、`externallyComplete` は false 固定である。

## 30 公開シグナル

判定は、名前・順序・型が層の間で一致し、仕様書の「保証しない」と回路が一致するときを整合とする。回路と API の厳しさが違うときを要確認とする。名前や式の矛盾は見つかっていない。

| 名前 | 意味 | 入力元 | 制約 | 保証される性質 | 保証されない性質 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| commitment | 秘密の Poseidon 像 | 非公開 `secret`。式は Poseidon(16, secret) | 等号 | その秘密を知っている | mini の `Poseidon(secret)` と同じ値であること。秘密の権限 | 整合 |
| nullifier | 再利用検出用の像 | secret、contextHash、policyId、policyVersion、epoch、executionId、domainSeparator。ドメイン 24 | 等号 | それらの束縛がこの値に入っている | 契約が未使用であること。グローバル一意 | 整合 |
| contextHash | context の像 | 非公開 `context`。Poseidon(18, context) | 等号 | そのフィールド要素が前像である | 元のバイト列。回路はフィールドだけを見る | 整合 |
| subjectCommitment | 秘密と subjectNonce の像 | Poseidon(17, secret, subjectNonce) | 等号 | その組の知識 | 主体の実在や身元 | 整合 |
| inputCommitment | 入力秘密の像 | Poseidon(19, inputSecret) | 等号 | その秘密の知識 | 入力の真正性 | 整合 |
| policyId | ポリシー識別子 | 証明者が供給。128 bit 以内 | 範囲。auth と nullifier の入力 | 識別子がその範囲で、二つのハッシュに入っている | ポリシー本文が守られていること | 整合 |
| policyVersion | ポリシー版 | 証明者が供給。128 bit 以内 | 範囲。auth と nullifier の入力 | 上と同じ | 版が承認済みであること | 整合 |
| authorizationCommitment | 承認材料の像 | Poseidon(21, authSecret, policyId, policyVersion, issuerId, audienceId) | 等号 | authSecret と四つの識別子の知識 | 署名。承認。権限の保有 | 整合 |
| issuerId | 発行者識別子 | 証明者が供給。160 bit 以内 | 範囲。auth の入力 | その整数が auth に入っている | 公開鍵や署名者との一致 | 整合 |
| audienceId | 受け手識別子 | 証明者が供給。160 bit 以内 | 範囲。auth の入力 | その整数が auth に入っている | `msg.sender` との一致。契約は無い | 整合 |
| epoch | 世代番号 | 証明者が供給。64 bit 以内 | 範囲。state の葉と nullifier の入力 | その整数が葉と nullifier に入っている | 現在の epoch | 整合 |
| issuedAt | 開始時刻の整数 | 証明者が供給。64 bit 以内 | 範囲。`issuedAt < expiresAt` | 二つの整数の順序 | 現在時刻。タイムゾーン。時計 | 整合 |
| expiresAt | 終了時刻の整数 | 証明者が供給。64 bit 以内 | 範囲と上記の順序 | 開始より大きい | 期限切れの拒否。責務は外部にあり、外部は未設定 | 整合 |
| revocationRoot | 深さ 1 の根 | 葉は Poseidon(26, subjectCommitment, 0)。sibling と path bit は証明者 | 葉と bit と sibling から根を計算 | その葉が、証明者の選んだ sibling でこの根になる | 外部の失効集合に無いこと | 整合 |
| stateRoot | 深さ 1 の根 | 葉は Poseidon(27, subjectCommitment, epoch)。sibling は証明者 | 上と同じ形 | その葉がその根に入る | 外部状態との一致 | 整合 |
| programHash | プログラム材料の像 | Poseidon(23, programVersion, programBody, zkvmProgramId) | 等号 | 版、非公開 programBody、zkvmProgramId の束縛 | プログラムの実行 | 整合 |
| programVersion | プログラム版 | 証明者が供給。回路は 64 bit 以内 | 範囲と programHash の入力 | その範囲の整数が programHash に入る | 値が 1 であること。API の `statementFromParts` は 1 以外を拒否するが、回路は拒否しない | 要確認 |
| inputRoot | 入力の葉と salt の像 | Poseidon(20, inputCommitment, inputSalt) | 等号 | inputCommitment とは別の値である | 大きな Merkle 木の根 | 整合 |
| outputCommitment | 出力秘密と実行 ID の像 | Poseidon(22, outputSecret, executionId) | 等号 | その outputSecret の知識 | guest の実行結果であること。API は既定の 4 命令の結果と一致しない outputSecret を拒否するが、回路は再実行しない | 要確認 |
| executionId | 実行識別子 | 証明者が供給。128 bit 以内 | 範囲。output、nullifier、ZKVM 束縛、attestation 束縛の入力 | それらのハッシュに入っている | 使用済み台帳 | 整合 |
| zkvmProgramId | guest 命令列の識別子として API が計算する値 | API は Poseidon(33, 1, 既定の 4 命令)。回路は公開入力として受け取る | programHash と zkvmProofCommitment の入力 | 証明者が出した値が二つのハッシュに入る | 命令列から回路が再計算したこと。guest 証明の検証 | 要確認 |
| zkvmProofCommitment | 実行タプルの像 | Poseidon(31, zkvmProgramId, inputRoot, outputCommitment, executionId) | 等号 | 四つの公開値の束縛 | ZKVM 証明が妥当であること | 整合 |
| teeMeasurement | 計測値として公開するフィールド要素 | 証明者が供給。フィールド全体 | attestation 束縛の入力 | その要素がハッシュに入る | ハードウェア計測値であること | 整合 |
| attestationCommitment | 計測タプルの像 | Poseidon(30, teeMeasurement, runtimeConfigHash, outputCommitment, executionId) | 等号 | 四つの値の束縛 | アテステーションが真正であること | 整合 |
| runtimeConfigHash | 設定語の像 | Poseidon(29, runtimeConfigWord) | 等号 | 一つの非公開語の前像 | 実行環境の設定全体 | 整合 |
| verifierId | 検証器の識別子 | 証明者が供給。128 bit 以内 | 範囲。domainSeparator の入力 | その整数がドメインに入る | 実在する検証器との一致 | 整合 |
| protocolVersion | プロトコル版 | 回路定数 1 | `protocolVersion === 1`。domainSeparator の入力 | 公開値が 1 である | デプロイがその版であること | 整合 |
| chainId | 連鎖識別子 | 証明者が供給。64 bit 以内 | 範囲。domainSeparator の入力 | その整数がドメインに入る | `block.chainid` との一致 | 整合 |
| contractAddressField | アドレス幅の整数 | 証明者が供給。160 bit 以内 | 範囲。domainSeparator の入力 | その整数がドメインに入る | 実際のコントラクトアドレス | 整合 |
| domainSeparator | 四つの公開値の像 | Poseidon(25, protocolVersion, chainId, contractAddressField, verifierId)。nullifier にも入る | 等号 | その四つと nullifier の束縛 | 実行環境が同じ四つであること | 整合 |

証明者が自由に選べる公開値は、policyId、policyVersion、issuerId、audienceId、epoch、issuedAt、expiresAt、programVersion、executionId、zkvmProgramId、teeMeasurement、verifierId、chainId、contractAddressField である。回路が付ける制限は、上のビット幅、時刻の順序、protocolVersion が 1、およびそれらがハッシュの前像に入ることだけである。revocationRoot と stateRoot は、証明者が sibling を選んだ結果として決まる。

`prove` の `publicOverrides` は、導出後の公開値を差し替える。差し替えがハッシュと矛盾すれば回路が失敗する。これは API の事前拒否とは別の層である。

## 回路が保証することと、外部が必要なこと

時刻: 回路は `issuedAt < expiresAt` だけを持つ。現在時刻との比較は回路に無い。期限切れを拒否する責務は外部にある。`checkWallClock` は信頼する時計が未定義で、引数の時刻を使わず `not-configured` を返す。`checkTimeOrder` は順序が正しくても `verified` を false のままにする。順序の成否は `ok` と `status` にある。

失効と状態: 深さは 1 である。対象は、未失効を表す定数 0 を入れた subject の葉と、subject と epoch の葉である。根の計算と、信頼できる根との一致は別である。一致を見る権限は未設定で、`checkRevocation` と `checkState` は引数を見ずに `not-configured` を返す。`rootsEqual` は文字列比較だけで、失効判定ではない。

承認: 生成式は上の Poseidon(21, ...) である。回路に署名検証は無い。署名方式、公開鍵、署名対象は仕様に無い。`checkAuthorization` は材料を渡しても `not-configured` である。コミットメントの一致は承認ではない。

ZKVM: `zkvmProofCommitment` は四つの公開値のハッシュである。回路は ZKVM 証明を検証しない。`zkvmProgramId` と `inputRoot` と `outputCommitment` と `executionId` は、そのハッシュの前像として結び付く。`checkZkvm` は `commitmentMatch` を計算できても `verified` は false のままである。検証器は未実装である。

アテステーション: `attestationCommitment` は計測値、設定ハッシュ、出力、実行 ID のハッシュである。回路は quote も証明書も検証しない。信頼の起点は未設定である。`checkAttestation` はダイジェストが一致しても `verified` を true にしない。

ゲスト: `guest.circom` は 4 公開シグナルの別回路である。公開は `zkvmProgramId`、`inputRoot`、`outputCommitment`、`executionId` の順である。4 ステップの直線プログラムで、load、0 か 1 の即値加算、halt だけを制約する。命令と即値は秘密入力であり、既定の `[1,0]、[2,1]、[3,0]、[3,0]` には固定されていない。出力秘密はその実行結果と等しい、という制約は guest 側にある。statement 側には無い。入力と出力の Poseidon ドメイン 19、20、22 は statement と同じ数である。プログラム ID のドメイン 33 も API の `guestProgramId` と同じである。プログラム ID の第二入力はリテラル 1 であり、公開信号 `programVersion` ではない。結び付きは、`statementFromParts` が既定プログラムの結果と ID を witness に入れることまでである。guest の `.zkey` と検証鍵は、この作業ツリーに無い。guest の証明を生成も検証もしていない。将来、guest の証明を statement の公開値と突き合わせるには、guest の鍵と、両証明を同時に検証する経路が要る。固定命令列の提案は `GUEST-INDEPENDENT-VERIFICATION.md` にあり、この調査の時点では未実装である。

## 外部検証の状態

| 項目 | 状態 | いまの戻り値 | 将来に必要なもの |
| --- | --- | --- | --- |
| 時計による期限 | 未設定。順序検査だけ別関数がある | 時計は `not-configured`。順序が正しくても `verified` は false | 信頼する時計、秒の整数、境界（`now == expiresAt` を含むか）、失敗時に証明を拒否する層 |
| 失効 | 未設定。文字列比較は別関数 | `not-configured` | 信頼する根の出所、深さと葉の定義、不一致の失敗 |
| 外部状態 | 未設定 | `not-configured` | 信頼する state root の出所と更新規則 |
| 署名と承認 | インターフェースのみ。方式は未決定 | `not-configured` | 署名方式、公開鍵、署名対象、ドメイン分離 |
| ZKVM 証明 | 未実装。コミットメント一致フラグだけある | `verified: false` | 検証器、プログラム ID、入出力との対応、失敗条件 |
| アテステーション | 未実装。ダイジェスト一致フラグだけある | `verified: false` | 形式、信頼の起点、検証方式、対象の実行との束縛 |

外部サービスは呼んでいない。`service.invoked` は false である。未設定を成功にはしていない。`externalReport` の `externallyComplete` は false 固定である。

## mini と FrozenCore

FrozenCore は、このリポジトリの中で世代ごとに回路と鍵を分ける基盤の名前である。別リポジトリではない。30 信号版はその中の一つの実験文であり、`SPEC.md` は唯一の正式仕様ではないと書いている。接続は `src/foundation.js` の `verifyStatement` で、スキーマが一致する検証器だけを呼ぶ。

| 実装 | 目的 | 公開信号 | 保証 | 鍵と経路 | 互換 |
| --- | --- | --- | --- | --- | --- |
| mini 0.1.0 | `commitment === Poseidon(secret)` | 1 個 | その秘密の知識 | 鍵はコミット `90df4d2` にある。作業ツリーの検証器は拒否する。Sepolia の記録は 1 信号 | 0.2.0 の鍵では検証できない |
| mini 0.2.0 | 上に context と nullifier を足す | 5 個 | 秘密、context、policyId、epoch の nullifier 束縛。ポリシー本文と現在 epoch は保証しない | `circuit/mini.zkey` と `keys/verification_key.json`。`src/verifier/verify.js` | 0.1.0 でも 30 信号でもない |
| statement | 30 信号の束縛 | 30 個 | この文書の表 | `frozencore/artifacts/statement.zkey` と `frozencore/keys/statement_verification_key.json`。`frozencore/src/verify.js` | commitment の式が違い、5 信号の上位互換ではない |
| guest | 4 命令の実行 | 4 個 | その直線プログラムの出力 | 証明鍵は無い。検証経路は無い | statement の証明ではない |

`docs/GENERATIONS.md` の世代表は、この作業ツリーの検証可否と一致している。このレビューではそのファイルを変更していない。

維持する必要性は、ここからは決まらない。0.1.0 はデプロイ記録が残っている。0.2.0 は作業ツリーの現行 mini である。30 信号は実験文である。guest は鍵が無い。

## 未決定の判断

採用はしない。選択肢だけを置く。

1. mini 0.1.0 のローカル検証。現状は拒否し、復元は未決定。維持するなら `90df4d2` の鍵を別パスへ複製する。拒否を確定するなら、Sepolia の 1 信号検証を別経路と書き切る。判断には、歴史的証明をローカルで再検証する要件が要る。決定前は現状の拒否を維持できる。決定後は、受け入れるなら専用検証器とテスト、拒否するなら文書の固定が要る。

2. mini 0.2.0 の役割。現状は 5 信号の現行 mini である。残す、凍結する、30 信号へ置き換える、がある。置き換えは別の文なので上位互換にならない。判断には、5 信号の利用継続が要る。決定前は両方の鍵を並置できる。決定後に置き換えるなら、呼び出し側と Sepolia とは別に移行が要る。

3. 30 信号を正式な statement にするか。現状は実験版で `production: false` である。正式にするには、要確認の 3 信号を回路と API で同じ規則にし、外部検証の範囲を決める必要がある。決定前は実験のまま証明と検証を続けられる。決定後に回路を変えるなら、新しい R1CS と新しい zkey と検証鍵が必要で、いまの `statement.zkey` は使えない。

4. guest の統合段階。この調査の時点ではソースと R1CS と WASM だけで、証明鍵は無い。その後の実装前仕様は、独立した二つの証明を第一候補にし、既定命令列の回路固定を提案している。回路は未変更であり、鍵も無い。API の事前検査は、いまの回路の保証ではない。命令列を固定する実装では、guest の R1CS と専用の鍵を新しくし、statement の鍵は使わない。

5. 期限、失効、署名、ZKVM、アテステーションの方式と信頼の起点。現状はすべて未設定である。選ぶまで `verified: true` にしてはならない。決定前は `not-configured` を維持できる。決定後は、その方式の検証器と失敗条件とテストが要る。回路のハッシュ式を変える場合は成果物の再生成も要る。

6. 本番セレモニーの対象。現状の開発用鍵は対象が二つあり、どちらも単一貢献者である。対象回路が決まるまで本番鍵は作らない。`frozencore/CEREMONY-PLAN.md` が手順の案である。このレビューはそれを実施していない。決定後も、開発用 zkey を上書きしない。

7. 仕様変更時の再生成。公開信号の順序、ドメイン、ビット幅、Poseidon の前像を変えたときは、その回路の R1CS、WASM、ptau、zkey、検証鍵を新しくする。API だけの拒否を強めても、手書き witness が回路を通る限り、鍵の再生成では埋まらない。

## この調査で実行していないこと

テストスイートは実行していない。前回以前の成功を、このレビューの結果としては使わない。`r1cs.info` も再実行していない。制約数 13081 は `frozencore/PROVENANCE.md` の記録であり、この場で測り直していない。
