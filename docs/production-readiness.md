# 本番化ベースライン（Step A）

記録日: 2026-10-09。この文書は監査記録であり、採用済みのプロトコル仕様ではない。

2026-10-23 の位置づけ: これは歴史資料である。現在の仕様の正本にはしない。記録のあと、作業ツリーには未追跡の `frozencore/`（実験用 30 信号と 4 信号 guest）、`experimental/local-tee/`、ローカル専用の 5 信号契約が追加されている。本文の「30 信号は実装しない」「ZKVM は無い」は、この監査セッションがそれらを採用も実装もしなかった、という意味である。本番化しない、という判定は維持する。0.1.0 のローカル再受け入れ、30 信号の正式採用、本番セレモニー、5 信号契約の公開デプロイは未決定のままである。本文に残る SHA-256 の実測は、2026-10-23 の mini 成果物とも一致している。README に残っていた古いハッシュは、この回復作業で実測値へ修正した。

判定: **本番化しない（no-go）。** テスト通過は、この作業ツリーが本番の安全性を満たす証拠にはならない。

この Step A では、回路、検証鍵、zkey、R1CS、WASM、デプロイ設定、公開 API を変更していない。`npm run build` は実行していない。ブロックチェーンへのデプロイとトランザクション送信は行っていない。

## リポジトリの関係

検証済み: 作業ツリーのルートは `C:\workspace\AegisProof mini` である。Git の origin は `https://github.com/zenoamo/AegisProof-mini.git`。ブランチは `main`。HEAD は `90df4d2`（Harden CodeQL filesystem and download checks）。

検証済み: このツリーに Frozen Core の回路、`production.zkey`、ZKVM ゲスト、リモートアテステーション検証器は無い。`README.md`、`CONTRIBUTING.md`、`docs/ARCHITECTURE.md`、`package.json` は、このリポジトリを AegisProof v2 の Frozen Core ではない実験用参照実装だと書いている。v2 のソースはこのツリーに無いので、v2 の 30 フィールドの意味、制約、検証鍵はここから確認できない。

未検証の仮定: Frozen Core という名前の別リポジトリが存在し、その公開信号が依頼文の 30 個と一致する、という対応は、このツリーの証拠だけでは確認できない。`fixtures/invalid/v2-public-signals.json` は 30 個の `"0"` と「v2 は 30 個で mini は拒否する」という注記だけであり、フィールド名は無い。

## 作業ツリーの保全

検証済み: Step A 開始時、`main` には未コミットの変更があった。5 公開信号への更新、`experimental/local-tee/`、ローカル専用の `AegisProofMiniStatement.sol` と `Groth16VerifierV2.sol`、`scripts/release.ps1` が含まれる。これらは戻していない。

検証済み: `experimental/sepolia/deployments/sepolia.json` は Git の変更一覧に無い。記録されているデプロイは chain `11155111`、コントラクト `0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790`、`publicSignalCount` は `1`。検証トランザクションは `0xee001b0be2d475973fc5292e3b2dab5df82d361eefc9875ea906a02eaae4749f`。`Groth16Verifier.sol` も変更一覧に無い。

## 現行プロトコル（作業ツリー）

検証済み: `src/constants.js` の版は `aegisproof-mini-0.2.0`、スキーマは `aegisproof-mini-public-signals-v2`。公開信号の順序は `commitment`、`nullifier`、`contextHash`、`policyId`、`epoch`。曲線の定数名は BN254。snarkjs の曲線名は `bn128`。秘密入力は `secret` と `context`。

検証済み: `circuit/main.circom` は次だけを制約する。

- `commitment` は `Poseidon(secret)`
- `contextHash` は `Poseidon(2, context)`
- `nullifier` は `Poseidon(3, secret, contextHash, policyId, epoch)`

`policyId` と `epoch` は nullifier に束縛される識別子である。回路はポリシー準拠、現在時刻、失効していないこと、呼び出し元を証明しない。

部分的に検証: `README.md` の再現性節に残っている SHA-256 は、公開信号 1 個の古いスナップショット（wasm `16fdc8b9…`、r1cs `29027acc…`、zkey `5b6a568c…`、verification key `cad6c287…`）である。同じファイルの前半は 5 信号と制約数 1767 を述べている。HEAD のコミット内容と、未コミットの作業ツリーは一致していない。

## このセッションで実行した検査

成果物を再生成するコマンドは使っていない。

| 検査 | 結果 |
| --- | --- |
| `npm run keys:check` | 成功。nPublic 5、制約 1767、非公開入力 2、公開入力 5。production=false。単一貢献者の開発用セレモニー。エントロピー破棄はこのコマンドでは確立されない、と出力した |
| `npm test` | 29 件成功、失敗 0 |
| `npm run test:local-tee` | 8 件成功、失敗 0 |
| `npm run sepolia:test` | 15 件成功、失敗 0。ローカル Hardhat。デプロイ済みコントラクトとの照合は読み取り。新しい公開ネットワーク取引は送っていない |

作業ツリーの `keys:check` が報告した SHA-256:

```text
circuit.wasm              8997ccc90e7804613499ea89d71ac5d4b5f24ba17ad27131e8bede56112f4b29
circuit.r1cs              7fde21c78b0ad9ea61de29ab4f9d88b992d49762b80e8718c946ccdf8817be70
circuit.zkey              9c7cb878ff4f5ccbedef828d9ae4a10277a816c41b7d54d580652e8c1c07af1e
verification_key.json     b8242de2d49d00093709760c497c241e73429e35ceec4541800435ef7778e21f
manifest.sha256           94daf00e3ae4363449ca6b105b427f262aaef74120967339e431e7ae2b4f89bf
```

toolchain は manifest 上、Node v24.18.0、snarkjs 0.7.6、circomlib 2.0.5、circomlibjs 0.1.7、circom コンパイラ記録 2.2.3。powers of tau は 11、貢献者 1、`toxicWastePersisted` は false。`.ptau` はリポジトリに無い。したがって zkey を ptau に対して再検証することは、このツリーだけではできない。

## 検証済み事実

- mini の現行証明は Groth16 / BN254 で、公開信号は上の 5 個である。
- デプロイ済み Sepolia 検証器の記録上の公開信号数は 1 である。5 信号の検証鍵とは別物であり、この監査では置き換えていない。
- ローカルの `AegisProofMiniStatement` は 5 信号を受け、nullifier を一度だけ記録する。`verifyProof` は状態を変えない。
- `experimental/local-tee` は通常の Node プロセスである。公開結果は `hardwareIsolation: false`、`remoteAttestation: false`、`attestation: null` を要求する。ハードウェア TEE でもリモートアテステーションでもない。
- 30 個の公開信号を持つ入力は、現行検証器が拒否する形として fixture にある。

## 部分的に検証済み

- Poseidon の Circom WASM、`circomlibjs`、正常入力での `prove()` の一致は、同じ作業ツリーに対する先行監査で測定されている。この Step A ではその比較を再実行していない。Solidity 検証器は Poseidon を再計算しない。Groth16 の受理は、その検証鍵に対する証明の受理である。
- 先行監査では、検証鍵の再エクスポートが `keys/verification_key.json` と一致し、同じ circom 2.2.3 での再コンパイルが作業ツリーの wasm と r1cs のハッシュと一致した。ptau が無いため zkey のセレモニー検証は未実施のままである。この Step A でも ptau 検証は実行できない。

## 未検証の仮定

- v2 Frozen Core の回路、公開信号名、検証鍵、セレモニー記録。
- 単一貢献者の開発用セットアップが、毒性のある乱数を破棄したという主張。manifest は破棄を証明しない。
- ハードウェア TEE、ベンダーのアテステーション基盤、ファームウェア計測値。
- ZKVM のゲスト、実行証明、プログラム ID。リポジトリに ZKVM は無い。
- `expiresAt`、`revocationRoot`、`chainId`、コントラクトアドレスが、現行システムで強制されているという仮定。強制されていない。

## 既知の欠陥

- セレモニー入力の ptau と貢献記録が残っていない。zkey の出所を独立に再検証できない。
- `verifyAndConsume` は呼び出し元を証明に束縛しない。誰でも有効な証明を消費できる。先回りは、その nullifier の使い捨てを妨げる。
- 読み取り専用の `verifyProof` は nullifier を消費しない。消費は `verifyAndConsume` だけが行う。
- 所有者の epoch とポリシー更新にイベントが無く、その管理操作の自動テストは statement テスト 4 件の範囲外である。
- 回路は `policyId` と `epoch` を nullifier に混ぜるだけで、ポリシー本文や壁時計を検証しない。
- `README.md` 第 14 節の対照表は、公開信号を `commitment` の 1 個と書いており、作業ツリーの 5 個と食い違う。

## 欠けている証拠

- powers-of-tau ファイル、phase-2 の貢献記録、毒性パラメータの破棄記録。
- 複数貢献者による本番セレモニー。
- Frozen Core のソースと、依頼された 30 名の機械可読な採用仕様。
- ZKVM 証明とその検証手順。
- ハードウェア計測値に対するアテステーション検証。
- 5 信号版の公開ネットワークデプロイ。現行の Sepolia デプロイは 1 信号のままである。この監査はそれを変えない。
- 制約数、証明時間、ガス、ZKVM コスト、アテステーション検証コストの、この Step A での新規測定。過去の制約数 1767 は `keys:check` が報告した。

## 30 信号のレビュー（未採用）

依頼された 30 名は候補である。この監査は名前を削除せず、実装もしない。現行 mini が既に持つのは 1、2、3、6、11 だけである。残りを公開信号として足すには、新しい版の回路と新しい検証鍵が必要で、現行の `circuit/mini.zkey` と Sepolia の 1 信号検証器は再利用できない。

共通の符号化案（承認前）: 公開信号は BN254 スカラーの正規十進文字列とする。先頭ゼロは禁止する。体の法以上は拒否する。バイト列は長さを先に置いた固定幅または長さ区切りでフィールド要素へ写す。連結の曖昧さとエンディアンの混在を禁止する。ドメイン分離タグは整数定数とし、用途ごとに値を分ける。

| # | 名前 | 現行 | レビュー |
| --- | --- | --- | --- |
| 1 | commitment | 回路が `Poseidon(secret)` として強制 | 秘密の像であり、ポリシーや時刻の正しさではない。秘密そのものは公開しない |
| 2 | nullifier | 回路が secret、contextHash、policyId、epoch から導出。ローカル契約が重複消費を拒否 | 一意性の範囲は global ではない。呼び出し元は未束縛 |
| 3 | contextHash | 回路が context から導出 | バイト列の正規化は JS 側。回路が見るのはフィールド要素 |
| 4 | subjectCommitment | 無し | 主体の約束。何をコミットするかが未定義。commitment と役割が重なり得る |
| 5 | inputCommitment | 無し | 18 `inputRoot` と重なり得る。どちらが正本かを先に決める |
| 6 | policyId | nullifier に束縛。契約の許可リストは別 | ポリシー本文のハッシュではない |
| 7 | policyVersion | 無し | policyId と組で版を表すなら、nullifier かドメインに入れる必要がある |
| 8 | authorizationCommitment | 無し | コミットメントは承認そのものを証明しない。承認関係の制約が別途必要 |
| 9 | issuerId | 無し | 発行者の署名またはメンバーシップ検証が無い限り、公開値は自己申告 |
| 10 | audienceId | 無し | 受信者束縛にするなら回路と契約の両方が検査する |
| 11 | epoch | nullifier に束縛。契約が現在 epoch と比較 | 壁時計ではない。所有者が epoch を進める |
| 12 | issuedAt | 無し | 発行時刻。信頼できる時刻源が無いと契約は失効を判定できない |
| 13 | expiresAt | 無し | 公開しただけでは失効しない。回路は issuedAt との順序、契約は時刻源との比較が必要 |
| 14 | revocationRoot | 無し | 根を公開しても未失効は証明されない。包含または非包含の証拠が必要 |
| 15 | stateRoot | 無し | どの状態木か未定義。契約の保存値と一致検査が必要 |
| 16 | programHash | 無し | 21 `zkvmProgramId` と重なり得る。プログラム識別子の正本を一つにする |
| 17 | programVersion | 無し | ハッシュと独立に公開する意味を定義する。ハッシュに含まれるなら冗長 |
| 18 | inputRoot | 無し | 5 `inputCommitment` と重なり得る |
| 19 | outputCommitment | 無し | 出力の像。ZKVM または回路がその導出を制約しない限り自己申告 |
| 20 | executionId | 無し | 実行の識別子。リプレイ範囲を nullifier とどう分けるかが未決 |
| 21 | zkvmProgramId | 無し | ZKVM がリポジトリに無い。programHash との統合を先に決める |
| 22 | zkvmProofCommitment | 無し | 証明のハッシュは ZKVM 証明の検証ではない。検証者を別に指定する |
| 23 | teeMeasurement | 無し | 生の計測値ではなくダイジェストにすべき。呼び出し元の自己申告を信用しない |
| 24 | attestationCommitment | 無し | アテステーションのハッシュは検証成功ではない。検証経路が必要 |
| 25 | runtimeConfigHash | 無し | どの設定バイト列か未定義 |
| 26 | verifierId | 無し | 検証器の識別。検証鍵のハッシュとの対応が必要 |
| 27 | protocolVersion | 無し | 版そのもの。ドメイン分離に入れる |
| 28 | chainId | 無し | 公開しただけでは連鎖間リプレイを止めない。回路に束縛し、契約が実行環境と比較する |
| 29 | contractAddressField | 無し | アドレスの正規符号化が必要。実際のコントラクトアドレスとの比較が必要 |
| 30 | domainSeparator | 無し | 他のフィールドから導出するなら独立信号にすると冗長。導出と検査の場所を決める |

強制しない性質は信号として追加しない。追加するなら、回路、契約、外部証明のどこが拒否するかをテストで固定する。

## 承認が必要な決定

実装に入る前に、次を人が選ぶ。

1. 30 信号を mini の現行回路へ上書きするか、別ディレクトリの新版として追加するか。推奨は後者。現行 zkey と Sepolia の 1 信号検証器は残す。
2. 冗長候補（programHash と zkvmProgramId、inputCommitment と inputRoot、domainSeparator の独立公開）を統合するか、名前を残して片側を非公開にするか。
3. nullifier の一意性を、文脈ごと、ポリシーごと、epoch ごと、連鎖と契約を含むドメインのどれにするか。
4. 呼び出し元を証明へ束縛するか、公開提出による先回りを明示して許容するか。
5. `expiresAt` の時刻源。チェーンのブロック時刻を使うなら、その粒度と合意を仕様に書く。
6. 失効を、根の公開だけで終わらせるか、非包含証明を回路で検証するか。
7. ZKVM を導入するか。現ツリーには候補実装が無い。Groth16 の公開信号へ証明ハッシュを置くだけでは検証にならない。再帰合成は、脅威モデルと費用を承認するまで始めない。
8. TEE を実験シミュレーションのままにするか、実ハードウェアの検証経路を別環境で用意するか。ローカルプロセスを TEE と呼ばない。
9. 本番セレモニーを行うか。行うなら ptau の出所、貢献記録、検証手順を残す。開発用の単一貢献者セットアップを本番と呼ばない。
10. デプロイ済み Sepolia 契約は変更しない。5 信号またはそれ以降を公開ネットワークへ出すかは、別の承認と別アドレスとする。

## 優先順

1. 上の決定を承認する。承認前は回路と契約を変えない。
2. 承認された信号だけを `docs/public-signal-schema.md` と機械可読スキーマにする。既存の `docs/ARCHITECTURE.md` と `docs/THREAT_MODEL.md` を正本として更新し、同内容の別名ファイルは作らない。
3. 新版回路は別成果物パスに出す。現行 `circuit/mini.zkey` と `keys/verification_key.json` と `Groth16Verifier.sol` は上書きしない。
4. セレモニー成果物を残し、`zkey verify` を再実行できる状態にする。検証できないセットアップは development のままにする。
5. 契約は、信号順、範囲、nullifier 消費、ドメイン、呼び出し元、期限、管理イベントをテストする。デプロイと取引送信はしない。
6. ZKVM と TEE は、実在する検証経路ができるまで「未接続」と書く。`zkvmProofCommitment` と `attestationCommitment` だけで検証済みと扱わない。
7. CI は、現行の `keys:check` とテストを維持する。新しい成果物のハッシュ検査は、その成果物が生成されてから追加する。

## Gate G0

満たした範囲: ベースラインをこのファイルに記録した。既存の未コミット変更は保持した。`npm test`、`keys:check`、local-tee テスト、Sepolia のローカルテストは、回路成果物を再生成せずに成功した。

未達: 本番準備の完了ではない。G1 以降の仕様ファイル、回路変更、セレモニー、契約変更、ZKVM、TEE 検証は始めていない。
