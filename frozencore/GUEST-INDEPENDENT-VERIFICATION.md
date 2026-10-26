# Guest 独立検証の実装前仕様

記録日: 2026-10-09。固定命令列は `circuit/guest.circom` に入れた。開発用の鍵、証明、検証は `frozencore/dev/guest/` と `src/guest-prove.js`、`src/guest-verify.js` にある。`production` は false で、単一貢献者の開発用セレモニーである。同じ zkey バイトの再生成はできない。手順は `node frozencore/scripts/build-guest.js` である。Statement の鍵は使っていない。全体判定は外部検証が未設定のため成功にしない。本番セレモニーは行っていない。

現行の事実の根拠は `circuit/guest.circom`、`circuit/statement.circom`、`src/statement.js`、`src/constants.js`、`src/verify.js`、`src/external.js`、`schema/public-signals-v1.json`、`schema/domains.json` である。

## 決定済みの方針

1. Guest と Statement は別々に証明し、別々に検証する。
2. 両方の証明を必須とする。これが独立検証方式の第一候補である。
3. Guest は汎用 ZKVM ではない。既定の命令列を実行する専用回路として設計する。
4. 命令列、レジスタの状態遷移、入力と出力の関係は、guest 回路の制約にする。
5. Guest 回路を変えるときは、guest 専用の鍵を新しく作る。Statement の鍵は guest に使わない。
6. 公開値の照合は、各 Groth16 検証とは別の処理である。
7. 外部検証が未設定のとき、または必須の外部条件が未達のとき、全体を検証済みにしない。
8. Guest の回路がこの仕様と一致するまでは、本番セレモニーの鍵を作らない。回路が一致する前は、guest の開発用の鍵も作らない。

B（statement へ実行制約を入れる）と C（再帰）は、この仕様では選んでいない。比較は `INTEGRATION-OPTIONS.md` に残す。

## 現行回路で確認できた事実

### Guest の入出力

公開信号の順序は `zkvmProgramId`、`inputRoot`、`outputCommitment`、`executionId` である。`constants.js` の `GUEST_PUBLIC_SIGNALS` もこの順である。

秘密入力は `inputSecret`、`inputSalt`、`outputSecret` の三つである。命令と即値は回路内の定数であり、witness ではない。コンパイル結果は制約 3942、公開 4、秘密 3 である。

`inputSecret` は 64 bit 以内、`executionId` は 128 bit 以内である。各ステップの出力レジスタも 64 bit 以内である。

### 命令と遷移

各ステップの opcode は 1、2、3 のいずれか一つである。即値は、opcode にかかわらず `imm * (imm - 1) === 0` で 0 か 1 である。

初期状態は、step0 の `priorHalt`、`r0`、`r1` がすべて 0 である。

停止前の遷移は次のとおりである。

| opcode | レジスタ |
| --- | --- |
| 1 | `r0` を `inputSecret` にする。`r1` は維持する。即値はレジスタに入らない |
| 2 | `r1` を `r0 + imm` にする。`r0` は維持する |
| 3 | レジスタは維持する。そのステップから停止状態になる |

停止後のステップは opcode が 3 であり、レジスタは前の値のままである。4 ステップ目の `halted` は 1 である。`outputSecret` は 4 ステップ目の `r1` と等しい。

`src/statement.js` の `runGuest` は、加算のときだけ即値のビットを検査する。回路は全ステップで即値をビットに制約する。既定の命令列の即値はすべて 0 か 1 なので、その列では両方を通過する。他の即値では API と回路の受理が分かれる。

### 既定命令列を回路に流した場合の計算

`DEFAULT_GUEST_PROGRAM` は `[1,0]、[2,1]、[3,0]、[3,0]` である。`SPEC.md` はこの列を、API が拒否に使う固定 4 命令と書いている。この列を現行の `Step` に入れると、遷移は次の一つに決まる。

| ステップ | 命令 | 入る前 | 出たあと | 停止 |
| --- | --- | --- | --- | --- |
| 0 | opcode 1、即値 0 | r0=0、r1=0 | r0=`inputSecret`、r1=0 | 否 |
| 1 | opcode 2、即値 1 | 上の出力 | r0=`inputSecret`、r1=`inputSecret + 1` | 否 |
| 2 | opcode 3、即値 0 | 上の出力 | レジスタは維持 | 停止 |
| 3 | opcode 3、即値 0 | 上の出力 | レジスタは維持 | 停止のまま |

和が 64 bit に収まるとき、最終 `r1` は `inputSecret + 1` である。`runGuest` もこの列ではその値を返す。和が 64 bit を超えると、回路の `Fit(64)` と API の範囲検査はどちらもその witness を拒否する。

4 ステップ目の停止は、レジスタを変えない。長さが 4 で、停止後の opcode が 3 でなければならない機械では、3 ステップ目で停止したあとの埋めになる。

opcode 1 と 3 の即値は、レジスタ遷移には現れない。プログラム ID の前像には入る。既定値はどちらも 0 である。即値 0 に、ロードや停止とは別の計算上の意味は、ソースからは読めない。

命令は定数なので、この列以外は充足できない。入力を読まない命令列は witness として渡せない。

### コミットメント

Guest が等号で結ぶ式は次のとおりである。

| 公開値 | 式 | 役割として回路から読めること |
| --- | --- | --- |
| `inputRoot` | Poseidon(20, Poseidon(19, inputSecret), inputSalt) | 入力秘密と salt の束縛。中間の Poseidon(19, inputSecret) は公開しない |
| `outputCommitment` | Poseidon(22, outputSecret, executionId) | 最終 r1 と実行 ID の束縛 |
| `zkvmProgramId` | Poseidon(33, 1, op0, imm0, op1, imm1, op2, imm2, op3, imm3) | 実際に使った命令と即値の束縛 |
| `executionId` | 公開入力。128 bit 以内 | 出力コミットメントの前像に入る。命令列からは計算されない |

第二入力の `1` は、`guest.circom` のリテラルである。`guestProgramId` は同じ位置に `PROTOCOL_VERSION`（`domains.json` の `protocolVersion`、値 1）を入れる。数値はどちらも 1 である。このリテラルを、statement の公開信号 `programVersion` と同じ意味としては扱わない。

### Statement

公開信号は `schema/public-signals-v1.json` の 30 名であり、`statement.circom` の `public [...]` と同じ順である。`verify.js` はそのスキーマ、版、`production: false`、信号名、正規十進、statement 検証鍵による Groth16 だけを見る。

Guest と名前が一致する公開値は、`zkvmProgramId`、`inputRoot`、`outputCommitment`、`executionId` だけである。statement 側の式は次のとおりである。

- `inputCommitment` は Poseidon(19, inputSecret)。`inputRoot` は Poseidon(20, inputCommitment, inputSalt)
- `outputCommitment` は Poseidon(22, outputSecret, executionId)。`outputSecret` を再実行する制約は無い
- `programHash` は Poseidon(23, programVersion, programBody, zkvmProgramId)
- `zkvmProofCommitment` は Poseidon(31, zkvmProgramId, inputRoot, outputCommitment, executionId)
- `programVersion` は 64 bit 以内で、`programHash` の入力である。回路は 1 と比較しない
- `executionId` は 128 bit 以内である

`statementFromParts` は、回路に渡す前に、`programVersion` が 1 であること、`outputSecret` が `runGuest` の結果であること、渡された `zkvmProgramId` が `guestProgramId` と一致することを拒否条件にしている。手書きの witness にはこの拒否は無い。`prove.js` は guest の Groth16 を作らない。

上の四つ以外の statement 公開値は guest の公開信号に無い。認可、失効、状態、時刻、nullifier、attestation、ドメイン分離を含む。

### 現行の各回路が保証すること

Guest が保証するのは、固定した命令列、停止、レジスタ幅、三つのハッシュ、最終 r1 と `outputSecret` の一致までである。和が 64 bit に収まるとき、その結果は `inputSecret + 1` である。汎用プログラムの実行は保証しない。

Statement が保証するのは、各ハッシュの前像、記載されたビット幅、`issuedAt < expiresAt`、`protocolVersion === 1`、深さ 1 の根の形までである。Guest の再実行、署名、現在時刻、外部の失効集合、外部状態、ZKVM 証明、アテステーションは保証しない。`zkvmProofCommitment` は四つの公開値の束縛であり、guest 証明の検証結果ではない。

### 外部検証の現状

`external.js` の実装から読める状態だけを書く。信頼する時計、失効権限、状態権限、署名方式、ZKVM 検証器、アテステーションの信頼の起点は、ソースに定義が無い。

| 項目 | 検証対象として関数が担うもの | 信頼の起点 | いまの方法 | 成功として実装が返すもの | 拒否として実装が返すもの | 状態 |
| --- | --- | --- | --- | --- | --- | --- |
| 時計と期限 | 現在時刻との比較 | ソースに無い | `checkWallClock` は引数を見ない | 成功を返さない | `not-configured`、`no-trusted-clock` | 未設定 |
| 時刻の順序 | `issuedAt < expiresAt` と 64 bit と正規十進 | 回路と同じ述語。時計ではない | `checkTimeOrder` | `ok: true` でも `verified: false`、`order-only` | 範囲外、順序違反、形式違反 | 順序だけ実装。検証済みにはしない |
| 失効 | 引数を見ない | ソースに無い | `checkRevocation` | 成功を返さない | `no-revocation-authority` | 未設定 |
| 外部状態 | 引数を見ない | ソースに無い | `checkState` | 成功を返さない | `no-state-authority` | 未設定 |
| 署名と承認 | 鍵も署名も見ない | ソースに無い | `checkAuthorization` | 成功を返さない | `no-signature-scheme` | 未設定。方式は未決定 |
| ZKVM | 文字列が一致すれば `commitmentMatch` | ソースに無い | `checkZkvm`。`externalReport` は引数なしで呼ぶ | `verified` は false | `no-zkvm-verifier` | 未実装 |
| アテステーション | 文字列が一致すれば `digestMatch` | ソースに無い | `checkAttestation`。報告では引数なし | `verified` は false | `no-attestation-trust-anchor` | 未実装 |

`externalReport` の `externallyComplete` は false 固定である。`service.invoked` は false である。Guest の制約は、これらの関数の代わりにならない。

成果物は、statement の開発用 zkey、ptau、検証鍵と、guest の開発用成果物が `frozencore/dev/guest/` にある。guest の本番鍵は無い。`verifyGuest` は guest の検証鍵だけを読む。

## 提案する変更

この節の定数命令は `guest.circom` に入れた。Statement 回路は変えていない。開発用の鍵は `frozencore/dev/guest/` にあり、本番鍵ではない。

命令と即値を秘密入力から外し、次の定数にする。

| ステップ | opcode | 即値 |
| --- | --- | --- |
| 0 | 1 | 0 |
| 1 | 2 | 1 |
| 2 | 3 | 0 |
| 3 | 3 | 0 |

初期レジスタと遷移は、現行の `Step` にこの定数を入れたときの表と同じにする。停止条件も同じで、4 ステップ目は停止状態であり、`outputSecret` は最終 `r1` と等しい。

入力が出力に関与する制約は、別のブール値を足すのではない。ステップ 0 が `r0` を `inputSecret` にし、ステップ 1 が `r1` を `r0 + 1` にし、`outputSecret` が最終 `r1` と等しい、という定数命令の遷移そのものにする。この遷移が成り立つとき、和が 64 bit に収まる witness では `outputSecret` は `inputSecret + 1` である。入力を読まない命令列は、opcode が定数であるために充足できなくなる。

公開信号の個数と順序は、現行の四つを維持する。

| 値 | 固定後の定義 | 役割 |
| --- | --- | --- |
| `inputRoot` | Poseidon(20, Poseidon(19, inputSecret), inputSalt) | statement の同名値と照合する入力の束縛 |
| `outputCommitment` | Poseidon(22, outputSecret, executionId) | 上記の実行結果と実行 ID の束縛 |
| `zkvmProgramId` | Poseidon(33, 1, 1, 0, 2, 1, 3, 0, 3, 0) | 定数命令列の識別子。第二入力の 1 はリテラルであり、`programVersion` ではない |
| `executionId` | 証明者が供給する 128 bit の公開入力 | statement との照合キー。プログラムの実行結果ではない |

この定数列のプログラム ID は、現行の `guestProgramId(DEFAULT_GUEST_PROGRAM)` と同じ前像になる。ID の数値を変える提案は、ここに含めない。

ロードと停止の即値 0 は、現行の既定列を定数化したものである。即値に追加の意味は与えない。4 ステップより短くする案も、ここに含めない。短くするとプログラム ID の前像が変わる。

固定後も guest が保証しないものは、`programBody`、`programVersion`、署名、時計、失効、外部状態、アテステーション、汎用 ZKVM の証明検証である。`executionId` の台帳上の未使用も保証しない。

## 公開値の照合

照合対象は次の四つだけである。比較は、各 Groth16 検証のあと、またはそれと独立に行う。比較の成功は、両方の公開配列で、同じ名前の値が正規十進の同じフィールド要素であることまでである。順序は guest が `zkvmProgramId`、`inputRoot`、`outputCommitment`、`executionId`、statement がスキーマの 30 名の並びである。名前で取り出し、添字を流用しない。先頭ゼロは不正とする。フィールド未満の十進だけを受理する。ドメインタグが同じ数であることは、照合の成功条件にしない。各回路の式は、その回路の証明が別途見る。

照合が成功しても、guest 証明が妥当であることにはならない。guest 証明が成功しても、statement が妥当であることにはならない。

### Statement 専用の四値

| 値 | 意味と生成元 | 検証の責務 | guest 公開信号へ足すか | 外部検証で見るか | statement 内で見るか |
| --- | --- | --- | --- | --- | --- |
| `inputCommitment` | Poseidon(19, inputSecret)。statement はこれを公開し、`inputRoot` の中間にする。guest は同じ式を内部信号にし、公開しない | 文字列として guest と比較する公開値が無い。`inputRoot` の一致は、この中間値の公開比較ではない | この仕様では足さない。表示用に公開する要件は未確定 | 未設定の外部項目には含まれない | statement 回路の等号 |
| `programVersion` | 証明者が供給する 64 bit。`programHash` の前像 | API は 1 を要求する。回路は要求しない。guest のプログラム ID 第二入力のリテラル 1 とは別の信号である | 足さない | 版の承認元は未設定 | 範囲と `programHash` への混入だけ。1 との一致は回路に無い |
| `programHash` | Poseidon(23, programVersion, programBody, zkvmProgramId)。`programBody` は guest に無い | 本文の実体を再計算する材料が公開側に無い | 足さない | 本文の出所は未設定 | statement 回路の等号 |
| `zkvmProofCommitment` | Poseidon(31, zkvmProgramId, inputRoot, outputCommitment, executionId) | 四つの一致と statement 証明の両方が成功すれば、この前像はその四つと一致する。これは guest 証明の検証ではない | 足さない | `checkZkvm` は未実装のままにする。このハッシュの再計算で `verified` を true にしない | statement 回路の等号 |

`programVersion` を 1 に固定するかを statement 回路へ入れるかは、未確定のままである。入れない限り、API の拒否と回路の受理範囲は分かれたままである。

## 検証フローと失敗条件

`verifyGuest`、`verify`、`reviewPair` がこのフローの実装である。`verify` は statement だけを検証する。`reviewPair` の `verified` は、外部の `externallyComplete` が true のときだけ true になる。いまそれは false 固定である。

報告は段階を分けて持つ。

| 段階 | 処理 | その段階の成功 | その段階の失敗 |
| --- | --- | --- | --- |
| 1. Guest 証明 | guest 専用の検証鍵で Groth16 を検証する。公開信号は 4、`nPublic` は 4 | その鍵での検証が真 | 鍵が無い、形式が違う、検証が偽。statement の成功では埋めない |
| 2. Statement 証明 | 既存の statement 検証鍵で Groth16 を検証する | 現行 `verify` が真になる条件 | 検証が偽。guest の成功では埋めない |
| 3. 公開値 | 四つを正規化し、名前ごとに比較する | 四つがすべて一致 | 欠落、非正規、範囲外、一つでも不一致。証明が両方真でも全体は検証済みにしない |
| 4. 外部検証 | `external.js` の結果を別欄に残す | 必須の外部条件が、設定済みの検証で成立したときだけ | 未設定、または必須条件の未達。証明と公開値の成功では埋めない |
| 5. 全体 | 1 から 4 の論理積 | 四段階がすべて成功 | どれか一つでも失敗または未設定なら、検証済みにしない |

段階の真偽は上書きしない。鍵が未作成のあいだ、段階 1 は成功にせず、全体も検証済みにしない。`externallyComplete` が false のあいだ、段階 4 は成功にしない。時刻順序の `ok: true` は、段階 4 の成功に数えない。

必須にする外部項目の一覧は未確定である。未確定のまま実装する場合でも、未設定の項目が一つでも残る報告を、全体の成功にしてはならない。

## 鍵とセレモニー

開発用と本番用を分ける。statement の zkey、ptau、検証鍵は開発用である。guest の開発用 zkey、ptau、検証鍵は `frozencore/dev/guest/` にあり、単一貢献者で `production: false` である。毒性パラメータの破棄は確認していない。再実行は同じ zkey バイトを再現しない。Guest の本番鍵は無い。

Guest の回路ソースが、この文書の固定命令列と一致するまでは、どちらの guest 鍵も作らない。一致したあとに作る開発用の鍵は、新しい R1CS に対する新しい ptau、zkey、検証鍵である。Statement の成果物とは別ディレクトリに置く。検証器は回路の識別子で鍵を選ぶ。公開信号の名前が一部同じでも、鍵を取り違えない。

回路を変えたときにやり直す作業は次のとおりである。

1. 変えた回路のソース、公開信号の順序、R1CS、WASM を、既存ファイルを上書きしない出力先へ出す。出力先のパスは未定である。
2. その R1CS だけで開発用セレモニーを行う。`verifyFromR1cs` に相当する検査と、検証鍵の `nPublic` を記録する。
3. 証明 API と検証 API を、その新しい鍵だけを読むようにする。
4. 固定命令列の遷移、64 bit を超える加算の拒否、四つの公開値の一致と不一致、片方の証明だけの失敗をテストする。
5. 古い未固定 guest の r1cs と wasm を、新しい鍵の入力にしない。

Statement 回路を変えない変更では、statement の開発用鍵は再生成しない。`programVersion` を回路で固定するなどの statement 変更を後で行う場合は、statement 専用の新しいセレモニーが別途必要になる。そのときも guest の鍵は流用しない。

本番セレモニーの手順と完了条件は `CEREMONY-PLAN.md` を維持する。この仕様は、その対象回路を 30 信号版にも guest にも確定しない。

## 未確定事項

- ロードと停止の即値 0 に、レジスタ以外の意味を後から与えるか。与えるなら命令列が変わり、プログラム ID も変わる。
- `programVersion` を statement 回路で 1 に固定するか。固定すると statement の鍵の作り直しが必要になる。
- `inputCommitment` を、照合とは別に公開表示するか。
- 必須の外部項目の一覧と、各項目の信頼の起点。
- `executionId` を未使用台帳と結ぶか。結ぶなら外部の責務である。
- 固定後の guest 成果物を書くディレクトリ。
- mini 0.1.0 をローカルで再び受け入れるか。
- 本番セレモニーの対象回路。

`now == expiresAt` の境界は、現行の順序検査が `issuedAt >= expiresAt` を拒否している。信頼する時計ができたときの境界は、時計の仕様が無いので未確定である。

## 実装開始の前提

次が揃ってから、回路ファイルを変更する。

1. 固定する命令列は、この文書の定数表である。
2. 公開信号は現行の四つと順序のままである。`programVersion` を guest の公開信号に足さない。
3. Statement の回路、statement の鍵、現行の guest の r1cs と wasm は、その変更で上書きしない。
4. 実装タスクが、新しい成果物の出力先を空のディレクトリとして決める。
5. 鍵生成は、変更後のソースと R1CS を確認したあとに限る。確認前の鍵生成は、この仕様の違反である。

API の `runGuest` と `guestProgramId` を、固定後の回路と同じ遷移と前像に揃える作業は、回路変更と同じ実装タスクに含める。揃える前の API だけを根拠に、guest 証明が既定列を検証したことにはしない。

## 本番セレモニー開始の前提

`CEREMONY-PLAN.md` の未決定に加え、次を満たすまで本番用の ptau と zkey を作らない。

1. Guest のソースが、この文書の固定命令列と公開信号とハッシュ式に一致している。
2. そのソースから作った開発用の R1CS、検証鍵の `nPublic`、`verifyFromR1cs` の結果が記録されている。
3. Guest と Statement の本番成果物のディレクトリが分かれている。
4. 開発用の単一貢献者セレモニーを、本番の貢献に数えない。
5. 外部検証の信頼の起点が未設定のままなら、本番鍵ができても全体を検証済みにしない、という判定を実装が守っている。

## 設計上のリスク

固定前の guest 回路のまま独立検証を実装すると、両方の証明が成功しても、入力が出力に使われたことは言えない。この仕様は、その実装順を採らない。

固定後も、statement の手書き witness は別の `outputSecret` を通り得る。それを拒むのは guest 証明と四つの照合であり、statement 証明の単独の成功ではない。

`programHash` と `programVersion` は、四つの照合では拘束されない。`programBody` が別の値でも、四つの公開値が一致すれば照合は成功する。

外部の信頼の起点が決まるまで、このフローの全体判定は検証済みにならない。それは未完成の成功ではなく、方針 7 の結果である。

既存の guest の r1cs と wasm は、未固定の回路の成果物である。固定後の鍵の入力にすると、検証器と回路が食い違う。
