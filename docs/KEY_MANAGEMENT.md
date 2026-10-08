# Key management

AegisProof-mini currently uses a single-contributor development ceremony.

これは development / reference implementation の鍵の扱いです。production-grade MPC ceremony ではなく、toxic waste の破棄を独立に検証する記録もありません。setup assumption は残ります。SHA-256 も ML-DSA-87 も、その assumption を消しません。trustless setup ではありません。

Groth16 の検証が成功する意味と、セレモニーを信頼する意味は別です。検証の成功は、いま使っている verification key の下で証明が受理されたことです。その鍵を誰が作ったかは、別の信頼です。

## Dependency graph

```text
circuit/main.circom
        │  circom 2.2.3
        ▼
circuit/main.r1cs          circuit/main.wasm
        │
        │  snarkjs zkey new + single contribution
        │  powers of tau はビルド中だけ存在し、リポジトリには残さない
        ▼
circuit/mini.zkey
        │  snarkjs zKey.exportVerificationKey
        ▼
keys/verification_key.json
```

wasm は witness 計算に使い、zkey の中身からは再生成しません。r1cs は zkey を作るときの回路です。verification key は zkey から書き出します。manifest はその四つのファイルの SHA-256 と、パス、サイズ、binding を記録します。`artifacts/manifest.sha256` はその manifest バイト列の SHA-256 です。

`artifacts/baseline.json` は、コミットされたスナップショットのハッシュとメタデータを固定します。`npm run build` は新しいセレモニーで manifest と zkey を書き換えても、baseline は書き換えません。

## Trusted artifacts

次が、このスナップショットで一緒に信頼するファイルです。

- `circuit/main.r1cs`
- `circuit/mini.zkey`
- `keys/verification_key.json`
- `artifacts/manifest.json`
- `artifacts/manifest.sha256`
- `artifacts/baseline.json`
- `circuit/main.wasm`（witness 計算。zkey の数学的対応そのものではない）

## Trust anchors

コードが実際に検査するものは次です。

| Anchor | 検査 |
| --- | --- |
| Artifact hashes | `npm run integrity`。manifest とファイルの SHA-256、記録されたサイズ |
| Verification key binding | `npm run keys:check`。`snarkjs.r1cs.info` と `snarkjs.zKey.exportVerificationKey` を使い、r1cs の本数と、zkey から書き出した verification key がファイルと一致するかを見る |
| Committed baseline | `keys:check` が `artifacts/baseline.json` と現在のハッシュを比べる。ビルドはこれを更新しない |
| Git history | 鍵を差し替えた commit の差分。baseline を黙って進めることは、この差分に出る |
| CI | `.github/workflows/ci.yml` は、`npm run build` の前に `npm run keys:check` を実行する。その後のテストは、そのジョブが作り直した開発用セレモニーに対する回帰 |
| Optional ML-DSA-87 | 呼び出し側が渡した公開鍵による成果物ダイジェストの署名。リポジトリは公開鍵を同梱しない |

GitHub の branch protection、required checks、force-push 禁止、署名付き commit、2FA は、このリポジトリのファイルからは設定済みかどうかを判断できません。下の「推奨」は、設定したという意味ではありません。

## 何を検査しているか

`snarkjs zkey verify`（`zKey.verifyFromR1cs`）は、r1cs、powers-of-tau、zkey の三つが必要です。powers-of-tau はビルドの作業ディレクトリにだけあり、検証が true になったあと削除します。コミット済みツリーだけでは、このコマンドは再実行できません。

コミット済みツリーに対する `npm run keys:check` が使う公式 API は次です。

- `snarkjs.r1cs.info`。曲線、制約数 415、秘密入力 1、公開入力 1
- `snarkjs.zKey.exportVerificationKey`。zkey から verification key を書き出し、`keys/verification_key.json` の protocol、curve、nPublic、点、IC と一致するか

これは、zkey と verification key の対応と、r1cs の公開メタデータと manifest の対応です。powers-of-tau に対する zkey の再検証ではありません。protocol は Groth16、snarkjs の曲線名は `bn128`、mini の曲線名は `bn254`、`nPublic` は 1 です。

`prove` と `verify` はこれまでどおり `checkIntegrity` を通します。毎回の証明で zkey 全体を読み直す検査は `keys:check` 側です。

## Fingerprint

```bash
npm run key-info
```

表示するのは protocol、curve、nPublic、制約数、各成果物の SHA-256、manifest の SHA-256 です。秘密、witness、トラップドアは出しません。この出力は、セットアップのエントロピーが破棄されたことを示しません。

`npm run keys:check` は同じ内容に加え、baseline との一致を終了コードで返します。失敗時の CLI 終了コードは 2 です。`key-info` は baseline を要求しません。CI は build の前に `keys:check` を実行します。そのあとの `test:positive` は、作り直したセレモニーについて zkey と verification key と manifest の対応を見ます。build が baseline を更新しないため、そのテストは baseline の `manifest.sha256` とは比べません。

## Key replacement

新しいセレモニーを採用するときは、次を同じ変更に含めます。

1. 新しい `circuit/mini.zkey` と `keys/verification_key.json`
2. `artifacts/manifest.json` と `artifacts/manifest.sha256`
3. `artifacts/baseline.json` のハッシュ、サイズ、`manifestSha256`

`npm run build` は 1 と 2 を書き換え、3 は残します。その状態で `npm run keys:check` は失敗します。baseline を更新するまで、その鍵はコミットされたアンカーではありません。wasm と r1cs を変えていない場合でも、zkey と verification key のハッシュは変わります。

Sepolia のコントラクトに埋められた検証鍵は、デプロイ時点の verification key です。鍵を差し替えても、既存の Sepolia deployment は自動では変わりません。この文書はコントラクトを再デプロイしません。

## ML-DSA-87

任意の真正性は次の鎖です。

```text
SHA-256 canonical artifact digest
        ↓
ML-DSA-87 signature
        ↓
trusted public key
        ↓
artifact authenticity
```

署名対象は、成果物ハッシュをキー名でソートした JSON の SHA-256 です。コンテキストは `aegisproof-mini/manifest-authenticity/v1` です。

この署名は Groth16 の証明が正しいことの代わりではありません。

```text
SHA-256 integrity  ≠  ML-DSA authenticity  ≠  Groth16 proof validity
```

秘密鍵は `*.mldsa.sk` として `.gitignore` に入っています。CLI は `--secret-key-out` を付けたときだけファイルへ書き、標準出力へは出しません。このリポジトリに ML-DSA 秘密鍵は置きません。CI に署名を足す場合も、GitHub Actions Secret を使い、リポジトリのファイルには保存しません。現在の workflow は署名を実行しません。

## Single-contributor limitation

貢献者は 1 人です。次は、このリポジトリの検査では防げません。

- その貢献者がトラップドアを保持したまま、受理される証明を作ること
- 開発マシンが侵害され、セレモニー中の値や署名鍵を抜かれること
- 信頼している ML-DSA 秘密鍵が漏れること
- GitHub アカウントが侵害され、baseline ごと差し替える commit が通ること

悪意のある貢献者の結託を、貢献者が一人であることから検出する仕組みはありません。一人が両方の役割を持っています。

## 推奨する GitHub 設定

次は推奨です。この作業ツリーは、設定済みであるとは記録していません。

- `main` を protected branch にする
- `npm run keys:check` を含む CI を required check にする
- force push を禁止する
- branch の削除を禁止する
- signed commits を検討する
- メンテナの GitHub アカウントで 2FA を使う
- release と tag の保護を検討する

## 残る trust assumption

- Groth16 の健全性は、証明鍵のトラップドアが偽造者に無いことに依存する。このセレモニーでは、それを第三者が検証できない
- powers-of-tau ファイルが残っていないため、コミット済み zkey を `zkey verify` で再検査できない
- manifest と baseline と Git 履歴を同時に支配できる者は、アンカーごと差し替えられる
- `verify` は ML-DSA を見ない
- Sepolia 上の true は、デプロイされた鍵の下での Groth16 受理であり、この baseline の検査ではない
