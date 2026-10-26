# Repository Recovery Report

記録日: 2026-10-23。作業ディレクトリ: `C:\workspace\AegisProof mini`。この文書は今回の回復作業の監査記録であり、プロトコルの採用決定ではない。本番環境が安全であるとは書かない。

## A. Executive Summary

実施したこと:

- 開始時の Git 状態を、前回報告の HEAD `90df4d2`、`origin/main` より 2 コミット遅れ、ステージなし、という観測と照合した。一致した。
- mini 0.2.0 の成果物 SHA-256 が、実ファイル、`artifacts/manifest.json`、`artifacts/manifest.sha256`、`artifacts/baseline.json` で一致することを読み取り専用で確認した。`npm run build` は実行していない。
- 静的検査、`keys:check`、`integrity`、mini のテスト、世代分離、local-tee、Hardhat、frozencore、`npm audit` を実行した。
- 文書の古いハッシュ、検証鍵のパス、export 先、TEE の記述を、現行ソースに合わせた。未決定事項は未決定のまま残した。
- `ci.yml` と `crypto-security.yml` に、世代分離、保護境界、local-tee、frozencore を追加した。Sepolia のローカルテストは、mini の build より前に置いた。
- `tests/protection/boundaries.test.js` を追加し、baseline を build が書かないこと、export が v1 verifier を変えないこと、本番モードと未設定の外部検証が成功にならないこと、保護パスへの書き込みが拒否されることを検査する。
- `origin/main` との差分を読み、merge、rebase、cherry-pick、commit、push はしていない。

修正した問題:

- README と `docs/REPRODUCIBILITY.md` が、1 信号時代の SHA-256 を作業ツリーの現行値として書いていた。現行値へ更新した。
- 30 信号の実行鍵をレガシーの `frozencore/keys/` と書いていた箇所を、`frozencore/dev/statement/` に直した。guest の開発用鍵が無い、という記述を、専用検証器はあるが `verifyStatement` は選ばない、に直した。
- `export-verifier.js` の出力先を、文書上も `Groth16VerifierV2.sol` の `uint[5]` にし、デプロイ済み `Groth16Verifier.sol` は不変だと書いた。
- local-tee の入出力を、0.2.0 の `secret`、`context`、`policyId`、`epoch` に合わせた。
- `SECURITY.md` の回路制約を、作業ツリーの 5 信号と、HEAD の 1 信号に分けた。
- CI が新しいテストを実行しない穴を、ワークフロー上は塞いだ。GitHub 上では未実行である。

未解決の重大事項:

- 単一貢献者の開発用セレモニーのままである。mini の ptau は無く、ptau に対する zkey 再検証はこのツリーだけではできない。
- 0.1.0 のローカル再受け入れ、30 信号の正式採用、本番セレモニー、5 信号契約の公開デプロイは未決定である。
- `origin/main` の Sepolia 強化は未統合である。重なるテストは、1 信号の `createSample()` と、作業ツリーの凍結 1 信号証明が衝突する。
- frozencore の再コンパイル一致テストは、この Windows 環境では失敗した。アプリケーション制御ポリシーが pin 済み circom の実行をブロックした。成果物は変わっていない。
- 追加した CI は、未追跡ファイルがコミットされるまで GitHub Actions のチェックアウトには入らない。

最終状態: HEAD は開始時と同じ `90df4d25d87791c29479a7e8c224b225b6721f5d`。保護対象の暗号成果物の SHA-256 は開始時と一致する。既存の未コミット変更は残している。コミットも push もしていない。

## B. Git State

| 項目 | 開始時 | 終了時 |
| --- | --- | --- |
| ブランチ | `main` | `main` |
| HEAD | `90df4d25d87791c29479a7e8c224b225b6721f5d` | 同じ |
| 追跡先 | `origin/main` より 2 コミット遅れ | 同じ。`git fetch` はしていない |
| 共通祖先 | `90df4d2`（`origin/main` は fast-forward） | 同じ |
| ステージ | なし | なし |
| マージ / rebase / commit / push | なし | なし |

開始時からあった利用者の変更は残っている。回路、zkey、verification key、manifest、baseline、`Groth16Verifier.sol`、`sepolia.json` は、この作業では書き換えていない。終了時のハッシュは開始時と同じである。

この作業で新たに触った追跡ファイル:

- `.github/workflows/ci.yml`
- `.github/workflows/crypto-security.yml`
- `tests/isolation.test.js`（`verify.js` が ML-DSA を参照しない検査を追加）
- すでに利用者が変更していた文書: `README.md`、`SECURITY.md`、`docs/ARCHITECTURE.md`、`docs/REPRODUCIBILITY.md`、`docs/SEPOLIA.md`、`docs/THREAT_MODEL.md`

この作業で新たに書いた、または注記を足した未追跡ファイル:

- `tests/protection/boundaries.test.js`
- `docs/REPOSITORY_RECOVERY_REPORT.md`（このファイル）
- 既存の未追跡文書への注記: `docs/GENERATIONS.md`、`docs/production-readiness.md`、`experimental/local-tee/README.md`、`frozencore/SPEC.md`、`frozencore/FORMAL-SPEC-REVIEW.md`

`tools/bin/circom-windows-amd64.exe` は、再コンパイル診断の過程で pin 照合後にキャッシュされた。`.gitignore` の `tools/bin/` に入り、Git の追跡対象には出ていない。実行は OS のアプリケーション制御ポリシーにブロックされた。

`.env` は存在する。内容は読んでいない。値はレポートに無い。新たに追跡対象へは加えていない。

## C. Artifact Integrity

検査は読み取り専用の SHA-256 と、`npm run keys:check`、`npm run integrity` である。終了時に同じファイルを再計算し、開始時と差が無いことを確認した。

### mini 0.2.0（作業ツリー）

| ファイル | バイト数 | SHA-256 | manifest | baseline | HEAD からの扱い |
| --- | --- | --- | --- | --- | --- |
| `circuit/main.wasm` | 2658039 | `8997ccc90e7804613499ea89d71ac5d4b5f24ba17ad27131e8bede56112f4b29` | 一致 | 一致 | 利用者の未コミット変更。この作業では不変 |
| `circuit/main.r1cs` | 243824 | `7fde21c78b0ad9ea61de29ab4f9d88b992d49762b80e8718c946ccdf8817be70` | 一致 | 一致 | 同上 |
| `circuit/mini.zkey` | 768568 | `9c7cb878ff4f5ccbedef828d9ae4a10277a816c41b7d54d580652e8c1c07af1e` | 一致 | 一致 | 同上 |
| `keys/verification_key.json` | 3935 | `b8242de2d49d00093709760c497c241e73429e35ceec4541800435ef7778e21f` | 一致 | 一致 | 同上 |
| `artifacts/manifest.json` | 2152 | `94daf00e3ae4363449ca6b105b427f262aaef74120967339e431e7ae2b4f89bf` | 自身 | `manifestSha256` と一致 | 同上 |
| `artifacts/manifest.sha256` | 65 | ファイルの中身が上の manifest ハッシュ | 一致 | 対象外 | 同上 |
| `artifacts/baseline.json` | 1274 | `9e9de510d409753c279a1110dec6e7c727e502350e6945996fce32abb68d732d` | 記録した成果物ハッシュと一致 | 自身 | 同上 |

`keys:check` の結果: protocol groth16、曲線 bn254、snarkjs 名 bn128、`nPublic` 5、制約 1767、秘密入力 2、公開入力 5、`production=false`、貢献者 1。終了コード 0。エントロピーの廃棄はこのコマンドでは確立されない、と CLI が出力した。

検証鍵は `protocol=groth16`、`curve=bn128`、`nPublic=5`、`IC` 長 6。公開順は commitment、nullifier、contextHash、policyId、epoch。回路 `circuit/main.circom` と `src/statement.js` の式は `Poseidon(secret)`、`Poseidon(2, context)`、`Poseidon(3, secret, contextHash, policyId, epoch)` で一致する。

### 保護したままのデプロイ世代

| ファイル | SHA-256 | この作業 |
| --- | --- | --- |
| `experimental/sepolia/contracts/Groth16Verifier.sol` | `74165a0229877ffbfbddbd6881bba24c1c37419a5a2540de07841db487c17f8e` | 不変。Git の変更一覧にも無い |
| `experimental/sepolia/deployments/sepolia.json` | `710021d53eb51d7417ff1971be2dd17db8f9a07a8c61c6b57dbfce6e1b9dd943` | 不変。`publicSignalCount` は 1、chain ID は 11155111 |

### frozencore

| 役割 | パス | SHA-256 | 公開入力 |
| --- | --- | --- | --- |
| statement 実行鍵 | `frozencore/dev/statement/statement.zkey` | `238119f4dcd4c0284715039081fd73d2604c273d32598ed326bbf97b61536abf` | 検証鍵 `nPublic` 30、`IC` 31。dev manifest の制約 13082 |
| statement 実行 vk | `frozencore/dev/statement/verification_key.json` | `8f1aaa10481eb0979e93aca0f8a630068ab9eeedfde8759d9ebfa0a2ea4b5973` | 同上 |
| guest 実行鍵 | `frozencore/dev/guest/guest.zkey` | `e7c09b791e24c8cdc31959ae6bb45111d4e1c35d827e230597d6795c0f0c9598` | 検証鍵 `nPublic` 4、`IC` 5。制約 3942 |
| guest 実行 vk | `frozencore/dev/guest/verification_key.json` | `76787928ea4a7b88b49b85f04f51c77fb07f66c893775ec71d40c6538233d955` | 同上 |
| レガシー zkey | `frozencore/artifacts/statement.zkey` | `4f7fa03a2e67c350f5d8dbc87d69322d8c7ffb7f75157197d2026030eab15a8a` | レガシー vk も `nPublic` 30。IC は実行鍵と異なる |
| レガシー vk | `frozencore/keys/statement_verification_key.json` | `5e713525ff4ab0d487648d629cf0087093613cc2bcb38024f73f496b614666cb` | 実行経路は使わない |
| レガシー ptau | `frozencore/setup/statement/pot_final.ptau` | `1e0defe426d65a56e32df4dd46444ed7031865db692f500f83cdf4356b1734c2` | 不変 |

`verifyStatement` が選ぶのは mini 0.2.0 と `frozencore-public-signals-v1` だけである。guest は `verifiableHere: false`。0.1.0 の `localAcceptance` は `undecided` のままである。

不一致は、文書が古いハッシュを現行値と書いていたことだけである。成果物側の不一致は見つかっていない。文書は実測へ合わせ、成果物は動かしていない。

## D. Test Results

時刻はツールが記録した UTC。ローカルは JST（UTC+9）。実行していない項目は成功と書かない。

| コマンド | 時刻 (UTC) | 終了コード | 結果 | 備考 |
| --- | --- | --- | --- | --- |
| `node scripts/security-observability.js static` | 2026-10-23 07:23 より前 | 0 | static checks: ok | `git ls-files` のみ。`.env` は読まない |
| `npm run keys:check` | 同上 | 0 | keys: ok。nPublic 5、制約 1767 | 成果物を書いていない |
| `npm run integrity` | 同上 | 0 | integrity: ok | 同上 |
| `npm test` | 07:23:35–07:24:06 | 0 | 36 pass / 0 fail | 保護テスト追加前。foundation、protocol、isolation、改ざん、ML-DSA、CLI を含む |
| `node --test tests/isolation.test.js tests/protection/boundaries.test.js` | 07:24 台 | 0 | 4 pass / 0 fail | ML-DSA 非依存と保護境界 |
| `npm run test:local-tee` | 07:24 台 | 0 | 8 pass / 0 fail | ハードウェア TEE 主張は拒否 |
| `npm run sepolia:test` | 07:24 台 | 0 | 15 passing | 下記の読み取り RPC が混ざった |
| `node --test frozencore/tests/*.test.js` | 07:27:42–07:28:44 | 1 | 68 pass / 1 fail | 再コンパイル 1 件が失敗 |
| `npm audit` | 07:27 台 | 1 | critical 0、high 0、moderate 0、low 19 | lockfile は変更していない |
| `npm test`（保護テスト追加後） | frozencore の後 | 0 | 39 pass / 0 fail | 約 23 秒。終了後のハッシュは開始時と一致 |

失敗した frozencore テスト: `frozencore/tests/audit.test.js` の `a temp rebuild matches r1cs and wasm and does not replace development keys`。`report.ok` が false。単体で同じ関数を呼ぶと `tool-missing` / `circom`、`protectedUnchanged: true`。`ensureCircom` は pin の SHA-256 と一致する Windows バイナリを `tools/bin/` に置いたあと、版確認のための起動に失敗する。起動時の OS メッセージは、アプリケーション制御ポリシーがそのファイルをブロックした、という内容だった。ポリシーを回避する変更はしていない。したがって、このマシンでは wasm と r1cs の再コンパイル一致は未確認である。保護ファイルのハッシュは変わっていない。

`npm run sepolia:test` について: ライブ比較を止めるため `SEPOLIA_RPC_URL` と `SEPOLIA_PRIVATE_KEY` を空文字にした。Windows は空の環境変数を子プロセスへ渡さない。Hardhat の `loadProjectEnv` が既存の `.env` を読み、`SEPOLIA_RPC_URL` が未設定のときだけ代入する。その結果、`deployed Sepolia verifier` の 5 件が実行された。観測できたのは、凍結した 1 信号証明についてローカル `AegisProofMiniSepolia` と記録上のコントラクトの bool が一致し、`publicSignalCount` が 1 だったことである。`verifyProof` と `publicSignalCount` の読み取りであり、このコマンドはデプロイも `verifyAndRecord` も送っていない。`.env` の値は表示していない。bytecode の一致や、記録の全レシートまでは、この 15 件の範囲では検査していない。

`npm audit` の Low は `@ethersproject/*`、`circomlibjs`、`diff`、`elliptic`、`ethers`、`hardhat`、`mocha`、`@nomicfoundation/hardhat-ethers`。`npm audit fix` は実行していない。

GitHub Actions は実行していない。ローカルの成功は、リモート CI の成功ではない。

## E. Security Findings

### 修正済み、または文書とテストで固定したこと

- 文書が 1 信号時代のハッシュを現行成果物として示していた。検査する人が正しいツリーを不一致と判定する状態だった。文書を実測へ合わせた。
- export 文書が、現行スクリプトと逆に v1 verifier を生成すると書いていた。実装は v2 を書き、v1 のバイト列が変わったら停止する。文書と `tests/protection/boundaries.test.js` をその実装に合わせた。
- `verify.js` が ML-DSA を呼ばないことを、ソース文字列の検査でも見るようにした。
- 本番モードは開発用鍵へ落ちない。未設定の時計、ZKVM、アテステーションは `verified: false`。保護パスへの出力は拒否する。これらは既存の frozencore テストに加え、mini の `tests/protection/boundaries.test.js` でも見ている。
- CI の build が verification key を書き換えたあとに Solidity テストを走らせると、生成済み V2 と鍵がずれる。`ci.yml` では `sepolia:test` を build の前に置いた。`crypto-security.yml` は従来どおり build しない。

### 未解決

| 問題 | 影響 | リスク | 次の対応 |
| --- | --- | --- | --- |
| 開発用単一貢献者セレモニー。mini に ptau が無い | この verification key の下での受理と、トラップドアを持たないこととは別 | 偽造耐性を本番水準では主張できない | `production: false` を維持する。本番セレモニーは未決定のまま始めない |
| 0.1.0 の鍵は作業ツリーに無く、Sepolia 記録は 1 信号 | 0.2.0 の証明はデプロイ記録の契約では受理されない | 世代を混ぜると検証が失敗する、または別命題を同じものだと誤認する | 再受け入れは `undecided`。戻すなら別ディレクトリへ複製し、現行 zkey は上書きしない |
| `verifyAndConsume` は `msg.sender` を証明に束縛しない | 有効な証明を誰でも消費できる | 先回りで nullifier を使えなくできる | 許容するなら仕様として固定する。束縛するなら新しい回路と鍵が要る |
| `verifyAndRecord` は失敗でも状態を上書きする | 読み取り結果と、最後に記録された bool は別 | 最後の記録を成功の証拠と誤読する | 1 信号契約の挙動として文書化した。origin の追加テストは未統合 |
| Windows が pin 済み circom を起動できない | 再コンパイル一致がこの環境では未確認 | CI の Ubuntu では通る可能性があるが、ここでは未証明 | ポリシーを緩めずに、許可されたコンパイラがある環境でその 1 件を再実行する |
| `npm audit` の Low 19 件 | 既知の推移的依存 | High / Critical は 0。修正版が無い `elliptic` を含む | lockfile をこの作業では変えない。別変更として扱う |
| 外部 trust anchor、ZKVM 検証、ハードウェア TEE | Groth16 の成功がそれらを意味しない | コミットメントの一致を検証済みと誤記する | `verified: false` を維持する |
| CI の新ステップは未コミットのパスに依存する | ワークフローだけを push すると GitHub が失敗する | 未追跡の実験コードが、公開コミットに無い | ソースとワークフローを同じコミットに含める判断が先。この作業では commit していない |

`origin/main` の 2 コミットは、保護対象の wasm、r1cs、zkey、verification key、manifest、baseline、`Groth16Verifier.sol`、`sepolia.json` を変更していない。`git diff --name-only HEAD..origin/main` にそれらのパスは無い。

## F. Documentation Changes

| ファイル | 解消したこと | 根拠 |
| --- | --- | --- |
| `README.md` | ハッシュを実測へ更新。30 信号の実行鍵と guest 鍵の位置。0.2.0 と frozencore は `90df4d2` に含まれない。デプロイ記録は 1 信号。local-tee はハードウェア TEE ではない | 実測ハッシュ、`src/foundation.js`、`sepolia.json` |
| `docs/REPRODUCIBILITY.md` | 同じハッシュ修正。CI が build 前に Sepolia を走らせ、build 後の自己一致は baseline と別だと書いた | `ci.yml`、`keys:check` |
| `docs/ARCHITECTURE.md` | export は V2 の `uint[5]`。v1 は不変。5 信号契約は未デプロイ。`verifyAndRecord` は失敗でも上書きする | `export-verifier.js`、両 Solidity 契約 |
| `docs/SEPOLIA.md` | 同上。ライブ比較は deployment と `SEPOLIA_RPC_URL` の両方があるときだけ | `sepolia-match.test.cjs` |
| `docs/GENERATIONS.md` | 実行鍵は `dev/`。guest は専用検証器があるがルータは通さない。0.1.0 は未決定のまま | 検証鍵の `nPublic` |
| `SECURITY.md` | HEAD の 1 信号制約と、作業ツリーの 5 信号制約を分けた。crypto-security の追加テストを反映 | `circuit/main.circom`、`git show HEAD:src/constants.js` |
| `docs/THREAT_MODEL.md` | crypto-security の対象に世代分離、local-tee、frozencore を追加 | ワークフロー |
| `docs/production-readiness.md` | 2026-10-09 の no-go 記録であることを冒頭に固定。現仕様で上書きしていない | ファイルの日付と、その後の未追跡ディレクトリ |
| `experimental/local-tee/README.md` | 入力を 0.2.0 の 4 フィールドに合わせた | `adapter.js` |
| `frozencore/SPEC.md` | statement の手順は guest 鍵を作らない。guest 鍵は `dev/guest` にあり、ルータは選ばない | `constants.js`、`foundation.js` |
| `frozencore/FORMAL-SPEC-REVIEW.md` | 当時「guest 鍵が無い」とした文は現在の配置と違う、と注記した。採用は未決定のまま | `dev/guest/verification_key.json` |

## G. CI/CD Changes

変更したワークフロー:

- `.github/workflows/ci.yml`
  - `keys:check` のあと、`npm run build` の前に `npm run sepolia:test`
  - build と既存の positive / negative / tamper / authenticity / integrity のあと、`tests/foundation`、`tests/protocol`、`tests/protection`、`npm run test:local-tee`、`frozencore/tests/*.test.js`
- `.github/workflows/crypto-security.yml`
  - build はしない
  - ML-DSA のあとに、同じ世代分離、local-tee、frozencore を追加
  - 既存の `sepolia:test` と `npm audit` 分類は残した。audit ステップは `scripts/security-observability.js audit` のままで、High / Critical 以外では失敗にしない、という既存の分類を変えていない

ローカルで通したコマンドはセクション D。GitHub 上の run は取得していない。未追跡の `frozencore/`、`experimental/local-tee/`、`tests/foundation/`、`tests/protocol/`、`tests/protection/`、`src/foundation.js` がコミットに含まれないチェックアウトでは、追加ステップは失敗する。

build が証明することと、baseline が証明することは分けた。

- `keys:check` は、チェックアウトされた成果物と baseline の一致
- `sepolia:test` は、そのチェックアウトの鍵と、リポジトリ内の Solidity
- `npm run build` は新しい開発用セレモニー。zkey のバイト列は毎回同じとは限らない。baseline は更新しない
- build 後の `integrity` と `test:positive` は、そのジョブが作った成果物の自己一致であり、採用済み baseline との一致ではない

## H. Git Integration Analysis

`origin/main` は `c97d62d` と `92a59ff`（どちらも「Harden Sepolia verifier integration」、2026-10-08）。暗号成果物は差分に含まれない。

| 変更 | 分類 |
| --- | --- |
| `AegisProofMiniSepolia.sol` の NatSpec | 作業ツリーはこのファイルを変更していない。HEAD へはそのまま載る。1 信号のままなので 0.2.0 の鍵とは別世代 |
| `deployment-record.cjs`、`deployment-record.test.cjs`、`load-env.cjs` の検証ヘルパー、`deploy.cjs`、`verify-tx.cjs` | 作業ツリーはこれらの既存ファイルを変更していない。新規ファイルは HEAD に無い。適用自体はプロトコル判断を変えない。ただし `verify-call.cjs` は作業ツリーも変更している |
| `docs/SEPOLIA.md` | 両方で変更。origin は 1 信号の `verifyAndRecord` の上書きを説明。作業ツリーは 5 信号 export を説明。統合が必要 |
| `verify-call.cjs` | 両方で変更。origin は `createSample()` とチェーン検査。作業ツリーは 5 信号化に伴い呼び出しを変えている。統合が必要 |
| `sepolia-match.test.cjs` | 両方で変更。origin は `createSample()` をデプロイ済み契約へ送る。作業ツリーは `loadFrozenV1Proof()` を使う。そのまま merge すると、5 信号の sample を 1 信号契約へ渡す。統合が必要 |
| `verifier.test.cjs` | 両方で変更。origin は 1 信号の負例と状態上書きを足している。作業ツリーの差分は小さい。内容の統合が必要 |
| 暗号成果物を origin の「変えていない」に戻すこと | 適用すべきでない。0.2.0 の利用者変更を破棄することになる |

失われ得るもの: 自動 merge をすると、作業ツリーの凍結 1 信号証明、5 信号の statement テスト、V2 export のどれかと、origin の 1 信号負例が片方に潰れる。この作業では統合していない。

## I. Remaining Blockers

人の決定が必要で、この作業では実施していない。

- 本番セレモニーと、毒性パラメータの廃棄記録
- 信頼する ML-DSA 公開鍵の配布。リポジトリは公開鍵を同梱していない
- ハードウェア TEE とリモートアテステーション。local-tee は通常プロセス
- ZKVM、失効集合、信頼できる時計、署名方式。`verified: false` のまま
- 30 信号 statement を正式な文として採用するか
- 5 信号契約を、現在の Sepolia アドレスとは別のアドレスへ公開デプロイするか
- 0.1.0 をローカル検証へ戻すか。現状は拒否で、方針は未決定
- `origin/main` を、未コミットの Sepolia 変更とどう統合するか
- 未追跡の実験ツリーをどのコミットに含めるか。含めずにワークフローだけを push すると CI は失敗する
- この Windows 環境で pin 済み circom を起動できるポリシーを用意し、再コンパイル一致テストを再実行するか

## J. Final Verdict

**PASS WITH LIMITATIONS**

定義した範囲のうち、成果物を再生成せずに行える整合性確認、mini と世代分離と local-tee と Hardhat のテスト、文書の矛盾修正、CI 定義の追加、origin 差分の分類は完了した。保護対象のハッシュは終了時も開始時と一致する。

完了していない、または成功と言えないもの:

- frozencore の再コンパイル一致 1 件は、この環境では失敗した
- GitHub Actions は未実行
- `origin/main` は未統合
- チェーン全体の再検証はしていない。読み取り RPC が意図せず 5 件走った
- 本番の安全性は確認していない。`ceremony.production` は `false`。`productionReadiness()` は `ready: false` のままである

### 完了条件

- [x] 既存変更を保護した
- [x] 現状と Git 差分を記録した
- [x] 暗号成果物の整合性を検証した
- [x] 世代間のプロトコル分離を確認した（テスト 39 件と frozencore 68 件）
- [x] 安全なテストを実行した
- [x] 失敗の原因を調査した（circom はポリシーにより起動できない）
- [x] 安全に修正できる文書、CI、保護テストを修正した
- [x] 文書の不一致を修正した
- [x] CI 定義の検証漏れを改善した。GitHub 上の実行は未確認
- [x] `origin/main` との差分を分析した。統合はしていない
- [x] 保護対象ファイルのハッシュが不変であることを再確認した
- [x] 秘密情報を出力していない
- [x] このレポートを作成した
- [x] 未解決事項を明示した

未達の実行: GitHub Actions の実ジョブ、mini 回路の ptau 再検証、frozencore の再コンパイル一致、origin の統合、公開デプロイ。理由は、それぞれリモート未実行、ptau が無い、OS がコンパイラをブロック、自動 merge の禁止、デプロイ禁止である。

## K. 再検証（2026-10-23）

同じ作業ツリーに対する再確認である。HEAD は開始時も終了時も `90df4d25d87791c29479a7e8c224b225b6721f5d`。`main` は `origin/main` より 2 コミット遅れ、ステージは空のままである。保護対象の SHA-256 はセクション C と一致し、テスト後の再計算でも差分は 0 件だった。`npm run build`、merge、commit、push、デプロイは行っていない。

この節の結果だけが、この再確認で実際に得たものである。セクション D の時刻と件数は、その時点の記録として残す。

| コマンド | 時刻 (UTC) | 終了コード | 結果 |
| --- | --- | --- | --- |
| `node scripts/security-observability.js static` | この再確認の前段。端末ログは残っていない | 0 | `static checks: ok`。`.env` は読んでいない |
| `npm audit` | 同上 | 1 | critical 0、high 0、moderate 0、low 19。lockfile は変更していない |
| `npm run keys:check` | 再確認のテスト開始直前 | 0 | keys: ok。nPublic 5、制約 1767。表示ハッシュはセクション C と一致 |
| `npm run integrity` | 同上 | 0 | integrity: ok |
| `node --test --test-force-exit frozencore/tests/*.test.js` | 07:44:25–07:45:22 | 1 | 68 pass / 1 fail |
| `npm test` | 07:45:43–07:46:21 | 0 | 39 pass / 0 fail。所要 35032 ms |
| `npm run test:local-tee` | 07:45 台。`npm test` と並行し、約 12 秒で終了 | 0 | 8 pass / 0 fail |
| `npm run sepolia:test` | 未実行 | — | 下記 |

失敗は前回と同じ `frozencore/tests/audit.test.js:123` である。`report.ok` が false。失敗直後に `rebuildInTemp()` を単体で呼ぶと、`stage: "tool"`、`code: "tool-missing"`、`detail: "circom"`、`protectedUnchanged: true` だった。一時ディレクトリでの再コンパイル一致は、この Windows 環境ではまだ確認できていない。保護ファイルは変わっていない。

`npm run sepolia:test` は再実行していない。空の環境変数では子プロセスが `.env` を読み、公開 RPC へ読み取り接続する。プロセス内で RPC を空にする起動方法は、資格情報の注入として実行前に止まった。承認を求めず、実ネットワークにも接続していない。前回記録の 15 件は、この再確認の結果ではない。

判定は変えない。**PASS WITH LIMITATIONS**。本番の安全性は確認していない。

## L. 原因確定と再実行（2026-10-23、HEAD `90df4d25d87791c29479a7e8c224b225b6721f5d`）

セクション K の結果は再利用していない。この節は、同じ HEAD の未コミット作業ツリーに対して取り直した実測である。ステージは空のままである。merge、commit、push、`npm run build`、Sepolia への接続は行っていない。

### circom

pin は `tools/circom-2.2.3-sha256.json` の `win32-x64`、SHA-256 `e43f132ee6f0aa79b705beceb59c2a7e6a54d7bdeab917ca34e9fc1951d185e1`。キャッシュ `tools/bin/circom-windows-amd64.exe` は 12039168 バイト、先頭 `4d5a`、ハッシュは pin と一致した。Zone.Identifier は無かった。

`spawnSync` の結果は `status: null`、`error.code: UNKNOWN`、`errno: -4094`、標準出力も標準エラーも空。`System.Diagnostics.Process.Start` は Win32 エラー **4551**（`ERROR_SYSTEM_INTEGRITY_POLICY_VIOLATION`）で失敗した。`C:\Users\admin\.cargo\bin\circom.exe` も同じ `UNKNOWN` / `-4094` で起動しなかった。バージョン不一致ではない。OS の完全性ポリシーが、pin 済みバイナリと既存の circom の両方のプロセス生成を拒否している。ポリシーは変更していない。

修正前の `ensureCircom()` は、プロセスが起動しなくても「ダウンロードした circom の版が一致しません」を投げ、`rebuildInTemp()` はそれを `tool-missing` に潰していた。起動拒否と、ファイルが無いこと、版が違うこと、コンパイル結果の不一致（`rebuild-compile` / `rebuild-r1cs` / `rebuild-wasm`）を分けた。

- 起動拒否は `tool-blocked` / `circom:execution-refused`
- パスが無い場合は従来どおり `tool-missing`
- 起動して版の文字列が 2.2.3 でない場合だけ、版不一致の例外
- 再コンパイル一致の assertion は `report.ok === true` のまま。起動できないことを成功にはしていない

修正後の単体呼び出しは `ok: false`、`stage: "tool"`、`tool-blocked`、`protectedUnchanged: true`。

### この節で実行した検証

| コマンド | 時刻 (UTC) | 終了コード | 結果 |
| --- | --- | --- | --- |
| `node scripts/security-observability.js static` | 07:55 台 | 0 | static checks: ok |
| `npm run keys:check` | 07:55:06 開始 | 0 | nPublic 5、制約 1767、`production=false` |
| `npm run integrity` | 同上、07:55:51 終了 | 0 | integrity: ok |
| `npm test` | 同じ開始バッチ。ランナー 72625 ms | 0 | 39 pass / 0 fail |
| `npm run test:local-tee` | 同じ開始バッチ。ランナー 31606 ms | 0 | 8 pass / 0 fail |
| `node --test --test-force-exit frozencore/tests/*.test.js` | 同じ開始バッチ。ランナー 86615 ms | 1 | 69 pass / 1 fail |
| `npm audit` | 07:55:06 の JSON と、その後の再実行 | 1 | critical 0、high 0、moderate 0、low 19、total 19 |
| `npm run sepolia:test` | 未実行 | — | 下記 |
| GitHub Actions | 未実行 | — | ローカル検証とは別 |

失敗は引き続き `frozencore/tests/audit.test.js:123`。期待は `report.ok === true`、実際は false。分類テスト「OS が circom の起動を拒否した場合は再コンパイル一致でも版不一致でもない」は成功した。欠落パスのテストは `tool-missing` のまま成功した。

`npm run sepolia:test` は未実施であり、成功ではない。`hardhat.config.cjs` は起動時に `loadProjectEnv` を呼ぶ。未設定のキーだけ `.env` から埋める。`sepolia-match.test.cjs` は deployment ファイルがあり、かつ `SEPOLIA_RPC_URL` が真のとき、記録上の Sepolia 契約へ `verifyProof` と `publicSignalCount` を送る。この環境ではその条件をコード上で外せないため、コマンド自体を起動していない。ローカル Hardhat の成功とも、公開ネットワークの検証ともみなさない。

検証後の保護対象 SHA-256 はセクション C と一致し、差分は 0 件だった。`ceremony.production` は false。`productionReadiness()` は `ready: false`、`mode: "development"`、`fallbackToDevelopmentKeys: false`。検証鍵は mini `nPublic` 5 / `IC` 6、statement 30 / 31、guest 4 / 5。30 信号は frozencore の開発用 statement であり、mini の 5 信号契約でも、デプロイ記録の 1 信号でもない。

### CI と origin

`ci.yml` と `crypto-security.yml` は、未追跡の `tests/foundation`、`tests/protocol`、`tests/protection`、`experimental/local-tee`、`frozencore` を実行する。これらがコミットに無いチェックアウトでは、そのステップは失敗する。`ci.yml` の `npm run build` は新しい開発用セレモニーで、baseline の一致検査ではない。GitHub 上の実行結果は無い。

`origin/main` は `c97d62d` と `92a59ff`。差分 10 ファイルに、wasm、r1cs、zkey、verification key、manifest、baseline、`Groth16Verifier.sol`、`sepolia.json` は含まれない。origin の `sepolia-match.test.cjs` は `createSample()` を 1 信号のデプロイ記録へ送る。作業ツリーは `loadFrozenV1Proof()` を使う。自動 merge はしていない。

### この節で変えたファイル

- `scripts/ensure-circom.js`：起動失敗を版不一致と分けた
- `frozencore/src/audit.js`：起動拒否を `tool-blocked` として返す
- `frozencore/tests/audit.test.js`：その分類を検査する。再コンパイル一致の要求は残した
- このレポート

判定は **PASS WITH LIMITATIONS** のままである。再コンパイル一致、GitHub Actions、Sepolia、`origin/main` の統合、本番セレモニー、ptau に対する zkey 再検証、実ハードウェア TEE、ZKVM、外部監査は未完了である。low 19 件が残るため、critical / high / moderate が 0 であることは監査がきれいだという意味ではない。lockfile は変更していない。

## M. 残件の実行（2026-10-23T08:16:37Z、HEAD `90df4d25d87791c29479a7e8c224b225b6721f5d`）

セクション L は上書きしていない。この節の数値は、この実行で取り直したものである。開始時も終了時も `main` は `origin/main` より 2 コミット遅れ、ステージは空、HEAD は同じである。一時 worktree `.recovery-head` は検査後に `git worktree remove` で削除した。コミット、push、merge、`npm run build`、ポリシー変更はしていない。

### circom

Windows 上の pin 済みバイナリは、前回と同じく Win32 4551 で起動しない。今回もポリシーは変えていない。

隔離環境を探した。WSL は `Linux x86_64`、Node `v24.21.0` だった。Docker の Linux エンジンには接続できなかった。WSL からは `/mnt/c/workspace` が見えず、`wsl --cd` でもリポジトリには入れなかった。ソースを `/root/aegis-recompile` へコピーする転送は、tar の終了コード 2 で壊れ、届いたのは `frozencore/circuit/guest.circom` だけだった。そのコピーの削除は、作業ツリーの外への再帰削除として止まった。残っているのはその 1 ファイルであり、保護対象の成果物ではない。pin 済み Linux circom による再コンパイルは完了していない。`report.ok === true` は変えていない。

### この節の検証

| コマンド | 終了コード | 結果 |
| --- | --- | --- |
| `node scripts/security-observability.js static` | 0 | static checks: ok |
| `npm run keys:check` | 0 | nPublic 5、制約 1767、`production=false`。表示ハッシュはセクション C と一致 |
| `npm run integrity` | 0 | integrity: ok |
| `npm test` | 0 | 39 pass / 0 fail。ランナー 28564 ms |
| `npm run test:local-tee` | 0 | 8 pass / 0 fail。ランナー 11041 ms |
| `node --test --test-force-exit frozencore/tests/*.test.js` | 1 | 69 pass / 1 fail。ランナー 50479 ms |
| `npm audit` | 1 | critical 0、high 0、moderate 0、low 19、total 19 |
| Hardhat `--network hardhat` の `verifier.test.cjs` と `statement.test.cjs` だけ | 0 | 10 passing。約 6 秒 |
| `npm run sepolia:test` | 未実行 | 成功ではない |
| GitHub Actions | 未実行 | ローカルの worktree 検査とは別 |

Frozen Core の失敗は再び `audit.test.js:123` の `false !== true` である。分類テストは成功した。欠落パスは `tool-missing` のままである。

### 依存関係

19 件はすべて low で、すべて推移依存か、その推移依存を名前として数えた直接パッケージである。`npm ls` では `circomlibjs@0.1.7` が `ethers@5.8.0` と `elliptic@6.6.1` を引き、`hardhat@2.29.1` が `mocha@11.8.0` 経由で `diff@7.0.0` を引く。直接の `ethers@6.17.0` は、監査範囲 `5.0.0-beta.119 - 5.8.0` の外である。

表示された修正は `circomlibjs@0.0.8` への major 降格、`hardhat@3.21.0`、`@nomicfoundation/hardhat-ethers@4.2.1` である。現行の回路バインディングと Hardhat 2 のテストを壊すため、lockfile も `package.json` も変更していない。`elliptic` は「危険な実装の暗号プリミティブ」、`diff` は `parsePatch` / `applyPatch` の DoS と出た。low が残るので、上位が 0 件であることは依存関係が安全だという意味ではない。

### CI

HEAD の detached worktree で、次は存在しなかった。`tests/foundation/generations.test.js`、`tests/protocol/signals.test.js`、`tests/protection/boundaries.test.js`、`experimental/local-tee/tests/adapter.test.js`、`frozencore/tests/audit.test.js`、`src/foundation.js`、`src/statement.js`、`Groth16VerifierV2.sol`、`AegisProofMiniStatement.sol`。HEAD の workflow に `frozencore` と `local-tee` の参照は無かった。作業ツリーの workflow はそれらの未追跡パスを実行する。したがって、workflow だけを今の HEAD に載せると CI は失敗する。`npm ci` と `npm run build` は、この worktree では実行していない。build は新しい開発用セレモニーになる。

### origin/main

`c97d62d` の親は `90df4d2`。`92a59ff` はその merge で、親は `90df4d2` と `c97d62d` である。差分は同じ 10 ファイルで、保護対象の暗号成果物は含まれない。統合はしていない。

`createSample()` は作業ツリーでは現行の `prove()` を呼び、公開信号 5 個を要求する。`loadFrozenV1Proof()` は `deployments/public-proof.json` を読み、公開信号が 1 個でなければ拒否する。origin の `sepolia-match` と verifier テストは `createSample()` を、公開信号 1 個の契約に対して使う。作業ツリーの同名関数は 5 信号なので、文字列を入れ替えると 1 信号契約へ 5 信号の証明を渡す。5 信号のローカル契約は `statement.test.cjs` が `createSample()` を使う側であり、デプロイ記録とは別である。

安全な統合案は、1 信号契約の負例と deployment record の検査を origin から移し、その入力は `loadFrozenV1Proof()` のままにすることである。5 信号の `createSample()` はローカルの statement 契約に限る。30 信号はどちらにも含めない。この案は未適用である。

### ネットワークと readiness

`npm run sepolia:test` は、`sepolia-match.test.cjs` が deployment と `SEPOLIA_RPC_URL` の両方があるとき公開 RPC へ `verifyProof` を送るため、起動していない。代わりに実行した 10 件は `--network hardhat` のインプロセス EVM であり、公開ネットワークの検証ではない。`hardhat.config.cjs` は起動時に `loadProjectEnv` を呼ぶ。出力にライブ比較の suite は出なかった。

`productionReadiness()` は `ready: false`、`fallbackToDevelopmentKeys: false`。`ceremony.production` は false。検証後の保護対象 SHA-256 の差分は 0 件である。

判定は **PASS WITH LIMITATIONS** のままである。再コンパイル一致、GitHub Actions、`npm run sepolia:test`、origin の統合、本番セレモニー、zkey の独立再検証は未完了である。

## N. 再コンパイル一致と依存関係の限定修正（2026-10-26T04:25:12Z、HEAD `90df4d25d87791c29479a7e8c224b225b6721f5d`）

セクション M は残している。開始時も終了時も HEAD は同じで、`main` は `origin/main` より 2 コミット遅れ、ステージは空である。`git ls-remote origin HEAD` は `92a59ff4e630c3a77a71484a13bebb23a89b2308` で、ローカルの `origin/main` と一致した。merge、commit、push、`npm run build`、ポリシー変更はしていない。

### 不完全な WSL コピー

`/root/aegis-recompile` は存在した。中身は `frozencore/circuit/guest.circom` だけだった。4803 バイト、SHA-256 `0ba50ff56de779bb2d400409f7217e09327700152d532a6c0d5b71859afd21b5`、CRLF、167 行で、末尾は `programHasher.inputs[8] <== op3;` だった。リポジトリ側は同じバイト数でも SHA-256 `db22a704c5c9e8ee168faef948614dd5d9394c9c257092a2dd97ffc0955f37da`、LF、172 行で、末尾は `component main` である。改行を除いても一致しない。プロセスは使っていなかった。親ディレクトリの時刻は 2026-10-23 17:13 で、失敗した転送の一時ディレクトリだと確認できた。その 1 ファイルを消し、空になった `circuit`、`frozencore`、`aegis-recompile` を `rmdir` した。再確認でパスは無い。`/root` 全体は消していない。

### circom

`tools/bin/circom-windows-amd64.exe` は 12039168 バイト、SHA-256 `e43f132ee6f0aa79b705beceb59c2a7e6a54d7bdeab917ca34e9fc1951d185e1` で pin と一致した。`spawnSync --version` は終了コード 0、`circom compiler 2.2.3` だった。今回は Win32 4551 を再現していない。ポリシーは変えていない。WSL からは `/mnt/c/workspace` は見えず、Docker の Linux エンジンにも接続できなかった。再コンパイルは Windows 上の pin 済みバイナリで行った。

`frozencore/tests/audit.test.js` の一時再コンパイルは、guest と statement の WASM と R1CS が既存の `frozencore/dev/` 成果物と一致し、開発用鍵は置き換わらなかった。単体は 1 pass。続けた Frozen Core 全体は 70 pass / 0 fail、ランナー 149002 ms、終了コード 0 である。これは ptau に対する zkey の再検証ではない。mini の production zkey、WASM、R1CS は再生成していない。

### この節の検証

| コマンド | 時刻 (UTC) | 終了コード | 結果 |
| --- | --- | --- | --- |
| `node scripts/security-observability.js static` | 04:19:25 開始 | 0 | static checks: ok |
| `npm run keys:check` | 同上、04:20:58 までに終了 | 0 | nPublic 5、制約 1767、`production=false` |
| `npm run integrity` | 04:20:58 終了 | 0 | integrity: ok |
| `npm test` | 04:19:25–04:21:38 | 0 | 39 pass / 0 fail。ランナー 120772 ms |
| `npm run test:local-tee` | その後 | 0 | 8 pass / 0 fail |
| `frozencore/tests/*.test.js` | 再コンパイル成功の後 | 0 | 70 pass / 0 fail |
| Hardhat `--network hardhat` の 1 信号と 5 信号のローカル 2 ファイル | 依存関係更新の前と後 | 0 | どちらも 10 passing |
| `npm audit` | 更新前 | 1 | critical 0、high 1、moderate 1、low 18、total 20 |
| `npm audit` | override 更新後 | 1 | low 19。high と moderate は 0 |
| `npm run sepolia:test` | 未実行 | — | 成功ではない |
| GitHub Actions | 未実行 | — | |

### 依存関係

更新前の high は `undici@6.29.0`（過剰な content-encoding の DoS）、moderate は Hardhat が引くその undici と `@ethersproject/abi` だった。low の `serialize-javascript@7.1.2` は `</script` の XSS だった。override を `undici@6.29.1` と `serialize-javascript@7.1.3` に上げ、`npm install` は 2 パッケージだけ変えた。lockfile の差分は 12 行である。暗号パッケージは動いていない。

残る 19 件はすべて low である。`diff@7.0.0` は mocha 経由の `parsePatch` DoS。`elliptic` は `circomlibjs@0.1.7` が引く `ethers@5.8.0` 経由で、表示された修正は `circomlibjs@0.0.8` への降格である。直接の `ethers@6.17.0` はその範囲外である。降格と Hardhat 3 は行っていない。

### CI と origin

`git ls-tree` で、HEAD に世代分離、local-tee、frozencore、`src/foundation.js`、`src/statement.js`、5 信号契約は無かった。作業ツリーの workflow はそれらに依存する。workflow だけを push すると CI は失敗する。GitHub Actions は実行していない。

origin の 2 コミットは Sepolia 関連のままである。`createSample()` は 5 信号、`loadFrozenV1Proof()` は 1 信号でなければ拒否する。統合はしていない。

### 成果物と readiness

終了時の保護対象 SHA-256 の差分は 0 件である。`productionReadiness()` は `ready: false`。`ceremony.production` は false。判定は **PASS WITH LIMITATIONS** である。解消したのは、壊れた WSL コピー、Frozen Core の再コンパイル不一致の未確認、undici の high と serialize-javascript の low である。残るのは GitHub Actions、`npm run sepolia:test`、origin の統合、本番セレモニー、ptau に対する zkey 再検証、low 19 件、workflow が未追跡ソースに依存することである。

## O. ライブ比較の明示化と再検証（2026-10-26T04:35:39Z、HEAD `90df4d25d87791c29479a7e8c224b225b6721f5d`）

セクション N は残している。開始時も終了時も HEAD は同じである。`git fetch origin main` の `FETCH_HEAD` は `92a59ff4e630c3a77a71484a13bebb23a89b2308` で、保存済みの `origin/main` と一致した。共通祖先は現在の HEAD である。`main` は 2 コミット遅れ、ステージは空のままである。commit、push、merge、`npm run build` はしていない。`npm run build` は開発用セレモニーで zkey を書き換えるため、一時ディレクトリでも実行していない。

### Sepolia の接続条件

`sepolia-match.test.cjs` は、deployment と `SEPOLIA_RPC_URL` があるだけで `JsonRpcProvider` を作っていた。`.env` は Hardhat 起動時に未設定のキーへ入る。今回、`experimental/sepolia/scripts/live-gate.cjs` を追加し、比較が有効になる条件を `AEGIS_SEPOLIA_LIVE=1` かつ deployment かつ RPC に変えた。RPC だけでは false である。有効なときの呼び出しは view の `verifyProof` と `publicSignalCount` である。`npm run sepolia:deploy` と `npm run sepolia:verify:tx` は別コマンドで、テストからは呼ばない。

`tests/sepolia/live-gate.test.js` は終了コード 0、1 pass である。`npm test` にも含まれ、40 pass / 0 fail になった。増分の 1 件はこのゲートである。`npm run sepolia:test` 自体は、公開 RPC へ接続し得るコマンドとして実行していない。代わりに `--network hardhat` で `verifier.test.cjs` と `statement.test.cjs` だけを実行し、10 passing、終了コード 0 だった。これは Sepolia の検証ではない。1 信号のローカル契約は `loadFrozenV1Proof()`、5 信号のローカル契約は `createSample()` のままである。

### この節の検証

| コマンド | 時刻 (UTC) | 終了コード | 結果 |
| --- | --- | --- | --- |
| `node scripts/security-observability.js static` | 04:31 台 | 0 | static checks: ok |
| `npm run keys:check` | 同上 | 0 | nPublic 5、制約 1767、`production=false` |
| `npm run integrity` | 04:31:41 終了 | 0 | integrity: ok。表示ハッシュはセクション C と一致 |
| `npm test` | 04:31:39–04:33:51 | 0 | 40 pass / 0 fail。ML-DSA の改ざん拒否を含む |
| `npm run test:local-tee` | 04:31 台、04:33:10 終了 | 0 | 8 pass / 0 fail |
| `frozencore/tests/*.test.js` | 04:31:38–04:34:08 | 0 | 70 pass / 0 fail。再コンパイル一致を含む |
| Hardhat `--network hardhat` のローカル 2 ファイル | その後 | 0 | 10 passing |
| `npm audit` | その後 | 1 | low 19。high 0、moderate 0 |
| 一時ディレクトリの `npm ci --ignore-scripts` | 04:35:31 終了 | 0 | 現行 lockfile からインストールできた。作業ツリーの `node_modules` は置き換えていない |
| pin 済み circom `--version` | テスト前 | 0 | `circom compiler 2.2.3`。SHA-256 は pin と一致 |
| `npm run sepolia:test` | 未実行 | — | 成功ではない |
| `npm run build` | 未実行 | — | セレモニーになるため |
| GitHub Actions | 未実行 | — | |

保護対象の再計算は差分 0 件である。mini の ptau はリポジトリに無い。存在するのは frozencore の dev 用 2 つと、レガシーの statement ptau だけである。`productionReadiness()` は `ready: false`。

### CI

HEAD に無く、作業ツリーの workflow が参照するのは、世代分離、protection、local-tee、frozencore、`src/foundation.js`、`src/statement.js`、5 信号契約である。`scripts/build.js`、`scripts/ensure-circom.js`、`scripts/security-observability.js` は追跡済みである。workflow だけを push すると、未追跡のテストが無いチェックアウトで失敗する。同一コミットに必要になるのは、それらのソース、テスト、frozencore の dev 成果物である。`.env`、`node_modules`、`tools/bin`、Hardhat cache は含めない。この作業では stage していない。

### origin と監査

origin の差分は Sepolia 関連 10 ファイルのままである。統合はしていない。適用するなら、1 信号の負例は `loadFrozenV1Proof()` のまま追加し、5 信号の `createSample()` は `statement.test.cjs` に限る。関数名の入れ替えはしない。30 信号は含めない。

low 19 は mocha 経由の `diff`（GHSA-73rr-hh4g-fpgx）と、`circomlibjs@0.1.7` が引く `ethers@5.8.0` / `elliptic`（GHSA-848j-6mx2-7j84）である。後者の修正表示は `circomlibjs@0.0.8` への降格なので適用していない。

判定は **PASS WITH LIMITATIONS** である。本番セレモニー、zkey の独立再検証、GitHub Actions、公開ネットワーク上の Sepolia 検証は未完了である。

## P. 最終監査（2026-10-26T04:43:03Z、HEAD `90df4d25d87791c29479a7e8c224b225b6721f5d`）

セクション O は残している。開始時もこの節の直前も HEAD は同じで、ステージは空、`main` は `origin/main` より 2 コミット遅れている。`git fetch origin main` の `FETCH_HEAD` と `origin/main` はどちらも `92a59ff4e630c3a77a71484a13bebb23a89b2308` だった。共通祖先は現在の HEAD である。commit、push、merge、`npm run build`、`npm run sepolia:test` はしていない。

### ライブゲート

`sepoliaLiveComparisonEnabled` は `AEGIS_SEPOLIA_LIVE` が文字列 `1` で、deployment があり、`SEPOLIA_RPC_URL` が真のときだけ true である。未設定、空文字、`0`、`true`、`yes`、`2` は false だった。`hardhat.config.cjs` は URL を設定オブジェクトに置くだけで、`JsonRpcProvider` は作らない。`sepolia-match.test.cjs` ではゲート判定のあと、`describe.skip` のコールバックの中の `before` でだけ provider を作る。

隔離した読み込みでは、RPC を `http://127.0.0.1:9` にしてもフラグが無いときは `describe.skip` が 1 回、provider 構築は 0 回だった。フラグが `1` のときも、ファイルを読み込んだ時点では provider 構築は 0 回で、`describe` の登録が 1 回だった。`loadFrozenV1Proof()` は 1 信号の比較と `verifier.test.cjs` に残り、`createSample()` は `statement.test.cjs` の 5 信号だけが呼ぶ。`tests/sepolia/live-gate.test.js` は 2 pass、終了コード 0 である。

`git diff --numstat HEAD` の実測は、`docs/SEPOLIA.md` が 8 行追加・6 行削除、`experimental/sepolia/test/sepolia-match.test.cjs` が 4 行追加・3 行削除である。この統計は HEAD からの作業ツリー差分であり、ゲート以前の Sepolia 編集も含む。

### この節の検証

| コマンド | 時刻 (UTC) | 終了コード | 結果 |
| --- | --- | --- | --- |
| static checks | 04:40 台 | 0 | ok |
| `npm run keys:check` | 同上 | 0 | nPublic 5、制約 1767、`production=false` |
| `npm run integrity` | 04:41:29 終了 | 0 | integrity: ok |
| `npm test` | 04:40:33–04:42:07 | 0 | 41 pass / 0 fail。ML-DSA の改ざん拒否を含む |
| `npm run test:local-tee` | 04:41:19 終了 | 0 | 8 pass / 0 fail |
| `frozencore/tests/*.test.js` | 04:40:33–04:42:24 | 0 | 70 pass / 0 fail。再コンパイル一致を含む |
| Hardhat `--network hardhat` のローカル 2 ファイル | 04:41:49 終了 | 0 | 10 passing。出力に Sepolia のライブ比較は無い |
| `npm audit` | 04:40:53 の JSON と、その後の再実行 | 1 | critical 0、high 0、moderate 0、low 19、total 19 |
| pin 済み circom | テスト前 | 0 | ファイル SHA-256 は pin と一致。`circom compiler 2.2.3` |
| `npm run sepolia:test` | 未実行 | — | 公開 RPC に接続し得る |
| `npm run build` | 未実行 | — | verification key と zkey を書く |
| GitHub Actions | 未実行 | — | |

`npm run build` は `keys/verification_key.json` を書き、zkey を `circuit/mini.zkey` として組み立て、baseline は更新しない、とソースにある。隔離環境でも実行していない。この節では lockfile からの再インストールもやり直していない。

### CI に必要な未追跡ファイル

workflow が参照し、HEAD では未追跡なのは次である。いずれも stage していない。

- `tests/foundation/`、`tests/protocol/`、`tests/protection/`
- `experimental/local-tee/`
- `frozencore/` のソース、テスト、dev 成果物
- `src/foundation.js`、`src/statement.js`
- `AegisProofMiniStatement.sol`、`Groth16VerifierV2.sol`
- `live-gate.cjs`、`tests/sepolia/live-gate.test.js`

`scripts/build.js`、`scripts/ensure-circom.js`、`scripts/security-observability.js` は追跡済みで、作業ツリーに変更がある。`.env`、`node_modules`、`tools/bin` は取り込み対象にしない。workflow だけを push すると、上の未追跡パスが無いチェックアウトで CI は失敗する。

### origin、監査、成果物

origin の `HEAD...origin/main` は Sepolia 関連 10 ファイルのままである。統合はしていない。1 信号の負例は `loadFrozenV1Proof()`、5 信号は statement 契約の `createSample()` に限る。30 信号は正式採用ではない。

low 19 は mocha 経由の `diff`（GHSA-73rr-hh4g-fpgx）と、`circomlibjs@0.1.7` が引く `ethers@5.8.0` / `elliptic`（GHSA-848j-6mx2-7j84）である。override は `undici@6.29.1` と `serialize-javascript@7.1.3` のままである。`circomlibjs@0.0.8` への降格はしていない。

保護対象 SHA-256 は、この節の開始時とテスト後で差分 0 件だった。`ceremony.production` は false。`productionReadiness()` は `ready: false`、`fallbackToDevelopmentKeys: false` である。mini の ptau は無い。判定は **PASS WITH LIMITATIONS** である。GitHub Actions、公開ネットワーク上の Sepolia、本番セレモニー、zkey の独立再検証は未完了である。

## Q. Sepolia の読み取り専用検証（2026-10-26T04:52:49Z、HEAD `90df4d25d87791c29479a7e8c224b225b6721f5d`）

セクション P は残している。開始時の HEAD は `90df4d25d87791c29479a7e8c224b225b6721f5d`、ブランチは `main`、ステージは空だった。`origin/main` は `92a59ff4e630c3a77a71484a13bebb23a89b2308` のままである。既存の未コミット変更と未追跡ファイルは保持した。commit、push、merge、`npm run build`、`npm run sepolia:deploy`、`npm run sepolia:verify:tx` はしていない。

### 事前監査

`sepoliaLiveComparisonEnabled` は、`AEGIS_SEPOLIA_LIVE` が文字列 `1` で、deployment ファイルがあり、`SEPOLIA_RPC_URL` が真のときだけ true である。`hardhat.config.cjs` は URL をネットワーク設定へ置くだけで、`JsonRpcProvider` は作らない。`sepolia-match.test.cjs` はゲートのあとで `describe` か `describe.skip` を選び、provider は有効時の `before` の中だけにある。

`npm run sepolia:test` は `run-hardhat-test.cjs` 経由で Hardhat のテスト一式を起動する。`--network sepolia` は付かない。ただしこのコマンドは読み取り専用ではない。`verifier.test.cjs` はローカル Hardhat 上で `AegisProofMiniSepolia` をデプロイし、`verifyAndRecord` を送る。`statement.test.cjs` は 5 信号の `createSample()` で `AegisProofMiniStatement` をデプロイし、`verifyAndConsume` を送る。ライブ比較の `before` も、比較用にローカル契約をデプロイする。リモート側の ABI は view の `verifyProof(uint256[1])` と `publicSignalCount()` だけで、接続先は provider であり signer ではない。`Groth16Verifier.verifyProof` は `public view` である。`verify-tx.cjs` と `deploy.cjs` は秘密鍵でトランザクションを送る別コマンドで、テストランナーからは呼ばれない。

そのため `AEGIS_SEPOLIA_LIVE=1 npm run sepolia:test` は実行していない。実行したのは、同じ凍結証明と view ABI に対する `eth_call` だけである。許可した RPC メソッドは `eth_chainId`、`net_version`、`eth_blockNumber`、`eth_getCode`、`eth_call` である。

`docs/SEPOLIA.md` の「`npm run sepolia:test` 自体はデプロイも状態変更トランザクションも送りません」は、Sepolia へ送らないという意味ではランナーの引数と一致する。ローカル Hardhat 上のデプロイと状態変更までは否定していない。この節では文書を書き換えていない。

### 接続と証明の対応

deployment 記録は chain ID `11155111`、公開信号 1、アドレス `0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790` で、アドレスはチェックサム形式と一致した。`loadFrozenV1Proof()` の公開信号は 1 個で、記録上の `lastCommitment` と一致した。`createSample()` はライブ比較からも `verify-call.cjs` からも呼ばれない。作業ツリーの `keys/verification_key.json` は `nPublic` 5 であり、今回のオンチェーン呼び出しが検証した鍵ではない。

RPC は設定されていた。スキームは `https`、URL の userinfo は無く、ホストは 4 ラベル、パスは 2 セグメント、クエリは 0 個だった。URL、ホスト名、API キーは記録していない。秘密鍵の環境変数はプロセス内に存在したが、Wallet は作っておらず、値も出力していない。`.env` は `.gitignore` のまま未追跡である。

### 実行結果

| コマンド | 時刻 (UTC) | 終了コード | 結果 |
| --- | --- | --- | --- |
| `node --test tests/sepolia/live-gate.test.js` | ライブ接続前 | 0 | 2 pass / 0 fail。RPC だけではゲートが開かず、ファイル読み込み時の provider 構築は 0 |
| `node scripts/security-observability.js static` | ライブ接続前 | 0 | static checks: ok |
| 読み取り専用の `eth_call` プローブ | 04:52:49–04:52:51 | 0 | 下記 |
| `AEGIS_SEPOLIA_LIVE=1 npm run sepolia:test` | 未実施 | — | ローカルデプロイと状態変更を含むため |
| `npm run sepolia:deploy` / `sepolia:verify:tx` | 未実施 | — | 書き込みコマンドのため |
| `npm run build` | 未実施 | — | zkey と verification key を書くため |
| 全体の `npm test`、Frozen Core、local-tee、`npm audit` | 未実施 | — | この節の対象外。直前の結果はセクション P |

公開ネットワークへは接続した。RPC の chain ID は `11155111`。対象アドレスのコードは 2138 バイトで、空ではなかった。ローカル Solidity とのバイトコード一致は、コンパイルを行っていないので未確認である。

`publicSignalCount` は 1。凍結した 1 信号の proof に対する `verifyProof` は true。改ざんした proof、改ざんした commitment、別の公開信号はいずれも false。観測した RPC メソッドは `eth_getCode`、`eth_chainId`、`eth_call` だけである。トランザクション送信とデプロイはしていない。

プローブ前の保護対象 SHA-256 は開始時と差分 0 件だった。`ceremony.production` は false。`productionReadiness()` は `ready: false`、`mode: "development"`、`fallbackToDevelopmentKeys: false` である。この検証は、デプロイ済みの 1 信号契約が凍結 proof を受理することを示す。本番セレモニー、現行 5 信号鍵のオンチェーン検証、zkey の独立再検証、実ハードウェア TEE、外部監査は完了していない。

判定は **PASS WITH LIMITATIONS** である。未解決なのは、Hardhat スイート全体を公開 RPC なしで分離したまま維持すること、デプロイ済みバイトコードと `Groth16Verifier.sol` のコンパイル一致、5 信号契約の未デプロイ、本番 readiness の不足証拠である。

この節を追記したあとの再確認でも、HEAD は `90df4d25d87791c29479a7e8c224b225b6721f5d`、ステージは空、保護対象 SHA-256 の差分は 0 件だった。この節で変更した追跡対象は無い。追記したのは未追跡のこのレポートだけである。

## R. zkey の技術的照合と 5 信号のオンチェーン未実施（2026-10-26T05:05:16Z、HEAD `90df4d25d87791c29479a7e8c224b225b6721f5d`）

セクション Q は残している。開始時の HEAD は `90df4d25d87791c29479a7e8c224b225b6721f5d`、ブランチは `main`、ステージは空だった。`production.zkey` というファイルは無い。実行中の証明鍵は `circuit/mini.zkey` で、manifest はこれを「Development-only single-party Groth16 setup. Not AegisProof v2 production.zkey.」と記録している。commit、push、merge、`npm run build`、Sepolia へのデプロイはしていない。`npm run build` は `build/setup` に ptau と新しい zkey を作り、`keys/verification_key.json` と `circuit/mini.zkey` を上書きし、最後に `build/setup` を削除する。

ツールは Node `v24.18.0`、リポジトリ内の snarkjs `0.7.6`（`node_modules/snarkjs/build/cli.cjs`）、pin 済み circom `2.2.3` である。実行前の circom バイナリ SHA-256 は `e43f132ee6f0aa79b705beceb59c2a7e6a54d7bdeab917ca34e9fc1951d185e1` で、`tools/circom-2.2.3-sha256.json` の win32-x64 と一致した。`circom --version` は終了コード 0 で `circom compiler 2.2.3` だった。

### A. zkey の照合

対象は `circuit/mini.zkey`、SHA-256 `9c7cb878ff4f5ccbedef828d9ae4a10277a816c41b7d54d580652e8c1c07af1e`、768568 バイトである。ファイル先頭は magic `zkey`、version 1、sections 10 だった。対応づける記録上の R1CS は `circuit/main.r1cs`（`7fde21c78b0ad9ea61de29ab4f9d88b992d49762b80e8718c946ccdf8817be70`）、WASM は `circuit/main.wasm`（`8997ccc90e7804613499ea89d71ac5d4b5f24ba17ad27131e8bede56112f4b29`）、検証鍵は `keys/verification_key.json`（`b8242de2d49d00093709760c497c241e73429e35ceec4541800435ef7778e21f`）である。

| 項目 | コマンド | 終了コード | 結果 |
| --- | --- | --- | --- |
| 回路ソースと R1CS / WASM | pin 済み circom 2.2.3 で一時ディレクトリへ `--r1cs --wasm` | 0 | 両方の SHA-256 が既存ファイルと一致。出力はリポジトリへコピーしていない |
| R1CS の統計 | `snarkjs r1cs info circuit/main.r1cs` | 0 | curve `bn-128`、制約 1767、秘密入力 2、公開入力 5、出力 0 |
| zkey から検証鍵を書き出し | `snarkjs zkey export verificationkey` を一時ファイルへ | 0 | protocol `groth16`。暗号フィールドは保存済み検証鍵と一致。`nPublic` 5、`IC` 6 |
| zkey と R1CS と ptau | `snarkjs zkey verify r1cs` | 1 | 対応する ptau が無く、開く前に `ENOENT` で停止した |

書き出した検証鍵のファイルバイト列は 3653 バイトで、保存済みの 3935 バイトとは一致しない。末尾改行と整形の差であり、protocol、curve、`nPublic`、各点、IC の値は一致した。この書き出しは同じ snarkjs 0.7.6 を別ディレクトリの出力先で実行したものである。別実装による検証ではない。

mini 用の ptau はリポジトリに無い。存在する ptau は `frozencore/dev/statement/pot_final.ptau`、`frozencore/dev/guest/pot_final.ptau`、`frozencore/setup/statement/pot_final.ptau` だけで、30 信号または guest 用であり、mini の代用には使っていない。貢献の transcript、beacon、複数貢献者の記録も無い。manifest は `ceremony.contributors` 1、`ceremony.production` false、`toxicWastePersisted` false である。

個別判定は次のとおり。

- zkey 形式: 確認した。magic、version、groth16 の検出。
- R1CS との暗号学的対応: 未検証。公開入力数がどちらも 5 であることは確認したが、`zkey verify r1cs` は完了していない。
- verification key の暗号フィールド: 確認した。
- 公開信号数: 確認した。R1CS 5、検証鍵 5、IC 6。
- ptau の整合性: 未検証。対応ファイルが無い。
- セレモニー transcript と信頼仮定: 未検証。単一貢献者の開発用セットアップという自己申告だけがある。

### B. 現行 5 信号

公開信号の順は `commitment`、`nullifier`、`contextHash`、`policyId`、`epoch` である。`circuit/main.circom` の公開宣言と同じで、`commitment = Poseidon(secret)`、`contextHash = Poseidon(2, context)`、`nullifier = Poseidon(3, secret, contextHash, policyId, epoch)` である。スキーマは `aegisproof-mini-public-signals-v2`。1 信号の `loadFrozenV1Proof()` はこの経路に入れていない。

`Groth16VerifierV2.sol` の `verifyProof` は `uint[5]` である。snarkjs 0.7.6 の `verifier_groth16.sol.ejs` は G2 の係数を `vk_beta_2[0][1]`、`vk_beta_2[0][0]` の順で出す。そのテンプレート順で、現行検証鍵の alpha、beta、gamma、delta、IC 0 から 5 は `Groth16VerifierV2.sol` の定数と差分 0 だった。`export-verifier.js` は Solidity を上書きするため再実行していない。ローカル Hardhat のコンパイラ設定は Solidity `0.8.24`、optimizer 有効、runs 200 である。`Groth16Verifier.sol` は `uint[1]` で、alpha は現行 5 信号鍵と一致しない。

ローカル検証は終了コード 0 だった。`tests/positive/prove-verify.test.js`、`tests/positive/key-binding.test.js`、`tests/negative/schema.test.js`、`tests/tamper/public-signal.test.js` は 8 pass / 0 fail である。正常な 5 信号 proof は検証に成功し、公開信号の改ざんは失敗し、30 個のベクトルと 0.1.0 の envelope は拒否された。`statement.test.cjs` を `--network hardhat` だけで実行し、4 passing だった。正常 proof はローカルの 5 信号契約で成功し、改ざん proof は nullifier を消費せず、別 epoch と未承認 policy は拒否された。これはローカル検証であり、Sepolia の結果ではない。

### C. オンチェーン

5 信号のデプロイ記録は無い。`experimental/sepolia/deployments/sepolia.json` の `publicSignalCount` は 1 のままである。`deploy.cjs` が送るのは `AegisProofMiniSepolia` の作成トランザクションで、秘密鍵を使い、デプロイ後に `publicSignalCount` が 1 であることを要求する。5 信号契約をデプロイするスクリプトは無い。承認が無いので、新しい作成トランザクションは送っていない。ガス見積りも、署名者を使うため行っていない。

比較のため、既存の 1 信号契約だけを読み取りで再確認した。2026-10-26T05:05:15Z から 05:05:16Z、終了コード 0。chain ID `11155111`、アドレス `0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790`、コード 2138 バイト、`publicSignalCount` 1、凍結した 1 信号 proof は true、改ざんした commitment は false。RPC メソッドは `eth_getCode`、`eth_chainId`、`eth_call` だけである。これは 1 信号の結果であり、5 信号鍵のオンチェーン検証ではない。

5 信号のオンチェーン検証は未完了である。必要なのは、現行 `Groth16VerifierV2` に対応する新しいコントラクトを Sepolia に作る明示的な承認、その作成トランザクション、デプロイ後のアドレスで `publicSignalCount` が 5 であること、5 信号の正常 proof と改ざん negative の `eth_call` である。既存アドレスへ 5 信号 proof を送ることはしていない。

### D. 安全性

トランザクション送信とデプロイはしていない。秘密鍵の環境変数はプロセス内に存在したが、Wallet は作らず、値も RPC URL も出力していない。検証後の保護対象 SHA-256 は開始時と差分 0 件である。一時ディレクトリのコンパイル結果と書き出した検証鍵は削除した。

### E. readiness

`ceremony.production` は false。`productionReadiness()` は `ready: false`、`mode: "development"`、`fallbackToDevelopmentKeys: false`、`productionKeysPresent: false` である。残る制限は、mini の ptau とセレモニー transcript が無いこと、zkey と R1CS の `zkey verify` が未完了であること、5 信号 verifier が Sepolia に無いこと、複数貢献者と毒性パラメータの破棄記録が無いことである。

判定は **PASS WITH LIMITATIONS** である。確認できたのは、現行回路と R1CS / WASM の再コンパイル一致、zkey から書き出した検証鍵の一致、5 信号のローカル検証である。確認できていないのは、ptau に対する zkey の独立検証と、現行 5 信号鍵のオンチェーン検証である。

この節を追記したあとの再確認でも、HEAD は `90df4d25d87791c29479a7e8c224b225b6721f5d`、ステージは空、保護対象 SHA-256 の差分は 0 件だった。追跡差分は開始時と同じ 42 ファイル、590 行追加、285 行削除である。
