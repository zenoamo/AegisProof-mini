# 本番向け Groth16 セレモニーの計画

この文書は計画である。本番用の鍵は生成していない。本番用セレモニーは実施していない。毒性パラメータの破棄も確認していない。

開発用成果物の検証成功は、本番のセットアップが信頼できることを意味しない。

## いま区別している成果物

| 回路 | R1CS | ptau | zkey | 検証鍵 | 区分 |
| --- | --- | --- | --- | --- | --- |
| `circuit/main.circom`（mini 0.2.0、公開信号 5） | `circuit/main.r1cs` | 作業ツリーに無い | `circuit/mini.zkey` | `keys/verification_key.json` | 開発用。単一貢献者。破棄は未確認 |
| `frozencore/circuit/statement.circom`（公開信号 30、`programVersion === 1`、制約 13082） | 現行の開発用は `frozencore/dev/statement/statement.r1cs`。固定前は `frozencore/artifacts/statement.r1cs` | 現行は `frozencore/dev/statement/pot_final.ptau`。固定前の ptau は `frozencore/setup/statement/` | 現行は `frozencore/dev/statement/statement.zkey`。固定前の `frozencore/artifacts/statement.zkey` は新しい R1CS と一致しない | 現行は `frozencore/dev/statement/verification_key.json`。固定前は `frozencore/keys/statement_verification_key.json` | どちらも開発用。単一貢献者。本番ではない。固定前の鍵は現行証明に使わない |
| `frozencore/circuit/guest.circom` | `frozencore/artifacts/guest.r1cs` | 無い | 無い | 無い | 証明鍵は未作成 |
| mini 0.1.0 | コミット `90df4d2` にのみある | 不明 | 同コミットの `circuit/mini.zkey` だったもの。作業ツリーでは上書き済み | 同コミットの verification key。`nPublic` は 1 | ローカルでの再受け入れは未決定。`docs/GENERATIONS.md` |

30 信号版の開発用ハッシュは `frozencore/PROVENANCE.md` にある。本番用ハッシュは無い。

## 本番セレモニーを始める前の条件

次が未決定、または未実装のあいだは、本番用の Powers of Tau と zkey を作らない。

- mini 0.1.0 をローカルで再び受け入れるか。
- 30 信号版を、どの利用でも正式な文にするか。いまは唯一の正式仕様ではない。
- 期限の時計、失効権限、署名方式、ZKVM 検証器、アテステーションの信頼の起点。`frozencore/src/external.js` はこれらを未設定のまま返す。
- 回路を変えた場合は、上の開発用 zkey を本番へ流用しない。新しい R1CS に対する新しいセレモニーが必要になる。
- Guest のソースが `GUEST-INDEPENDENT-VERIFICATION.md` の固定命令列と一致するまで、guest の開発用 zkey も本番用 zkey も作らない。Statement の鍵を guest の検証に使わない。
- Guest と Statement の鍵、ptau、検証鍵は別ディレクトリで管理する。開発用セレモニーの成果物を本番用ディレクトリへ混ぜない。
- Guest 回路を変えたあとは、新しい R1CS に対して guest 専用の ptau、zkey、検証鍵を作り、`verifyFromR1cs` と `nPublic` を記録する。既存の statement 成果物と、未固定の guest の r1cs と wasm は、その作業で上書きしない。新しい出力先は未定である。
- 本番セレモニーは、guest の回路が仕様と一致し、その開発用検証が記録されたあとでも、この節の他の未決定が残るあいだは始めない。本番鍵ができたあとでも、外部検証が未設定なら全体を検証済みにしない。

## 実施するときの手順

対象回路ごとに、別ディレクトリへ出す。`circuit/mini.zkey`、`keys/verification_key.json`、`frozencore/artifacts/statement.zkey` は上書きしない。

1. 対象の Circom ソース、公開信号の順序、R1CS の SHA-256 を固定し、参加者が同じファイルを確認する。
2. Phase 1 は、出所が記録された Powers of Tau を使う。新規に作る場合は、複数の貢献者を置く。貢献者の名前、使用した実装、貢献ハッシュ、次のチャレンジを残す。一人の開発用エントロピーラベルは、本番の貢献に数えない。
3. Phase 2 は、その R1CS と Phase 1 の最終 ptau から zkey を作る。貢献ごとにハッシュを残す。
4. `zkey verify` に相当する検査を、残した ptau と R1CS に対して実行し、結果とコマンドを記録する。検証鍵は zkey から書き出し、IC の長さが公開信号数 + 1 であることを確認する。
5. ptau、zkey、検証鍵、R1CS、WASM、回路ソースの SHA-256 を公開する。保管は本番用ディレクトリと、それとは別の写しとする。開発用ディレクトリへ混ぜない。
6. 毒性パラメータは、各貢献者が自分の乱数を破棄したという記録を、貢献者ごとに残す。運営者が「破棄された」と書くだけでは完了にしない。記録が無い貢献は、本番の貢献に数えない。
7. 検証鍵の切り替えは、検証器が読むパスを設定で新しいファイルへ向ける。失敗したときは設定を開発用のパスへ戻す。チェーンへは、この計画だけではデプロイしない。既存の Sepolia コントラクトは変更しない。

## 完了とみなす検査

次のすべてが記録されているときだけ、その回路の本番セットアップを完了とする。

- 回路ソースと公開信号仕様が、セレモニーに使った R1CS と一致する。
- 貢献者が複数で、各貢献のハッシュが残っている。
- ptau が残り、zkey の検証が成功している。
- 検証鍵の `nPublic` が、その回路の公開信号数と一致する。
- 開発用 zkey の SHA-256 と、本番用 zkey の SHA-256 が違う。
- 毒性パラメータの破棄記録が、貢献者ごとに残っている。
- 切り替え先と、戻すパスが文書になっている。

現在の開発用成果物は、この検査を満たしていない。参加者、独立検証者、承認が揃うまで、セレモニーと本番鍵の生成は実行しない。架空の参加者、署名、破棄証跡は作らない。

## 人が揃うまで実行しないこと

本番用ディレクトリ `frozencore/production` は空のままである。開発用 zkey、レガシー zkey、mini の zkey をそこへコピーしない。単一貢献者の開発用セレモニーを、貢献者数の欄を書き換えて本番にしない。

本番を始める前に、人が次を決める。

- 対象回路は、採用が承認された Statement と Guest のソースだけにする。回路を変えたあとの R1CS に、古い zkey を載せない。
- Phase 1 の Powers of Tau と Phase 2 は、実在する複数の貢献者が別々に行う。各人の識別子、実装、貢献ハッシュ、次のチャレンジを残す。
- 各貢献者の記録は、自分とは別の検証者、対象 zkey と R1CS の SHA-256、通常ファイルへの相対パスを持つ。パスは `frozencore/production` の外へ出ない。
- 独立検証者は貢献者本人と同一であってはならない。検証者は `verifyFromR1cs`、公開信号の順序、検証鍵の `nPublic` と IC を自分の環境で確認し、その記録に署名する。署名方式は未定なので、JSON の存在は署名の代わりにならない。
- toxic waste は貢献者ごとに破棄する。運営者の `toxicWasteDestroyed: true` や `witness: "self-asserted"` は証跡にしない。破棄の検証方式も未定である。
- 承認者は、上記の記録と、開発用およびレガシー成果物とハッシュが異なることを確認してから、本番マニフェストを公開する。マニフェストのハッシュとファイルが一致しないものは承認しない。
- 本番鍵の保管先、読み取り権限、切り替え先、失敗時に開発用へ戻さないことを、承認の前に文書にする。このリポジトリの検証器は、本番モードで開発用鍵へ戻らない。

`readiness.js` は、これらの記録が無い、形式が違う、ハッシュが違う、署名方式が未定、のいずれでも `ready: false` を返す。
