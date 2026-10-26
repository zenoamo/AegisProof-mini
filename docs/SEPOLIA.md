# Sepolia

AegisProof-mini の既存回路で作った Groth16 証明を、Ethereum Sepolia 上で検証する experimental integration です。Core の回路、`src/prover`、`src/verifier`、`src/integrity`、`src/authenticity`、既存の zkey と verification key は変更しません。

Sepolia はテストネットです。mainnet は使いません。オンチェーン検証は experimental integration layer であり、Core protocol ではありません。

この文書は README の「Sepolia Integration」と同じ実装を、手順の側から書いています。数値が違うときは、リポジトリ内の `experimental/sepolia/deployments/sepolia.json` を優先してください。

## Network

| 項目 | 値 |
| --- | --- |
| Network | Ethereum Sepolia |
| Chain ID | 11155111 |

## Contract architecture

```text
AegisProof-mini
│
│ generate proof
▼
proof.json
│
▼
Sepolia RPC
│
▼
Groth16Verifier
│
▼
verifyProof()
│
▼
true / false
```

`npm run sepolia:export-verifier` は、直下の 1 信号の zkey と `keys/verification_key.json` が一致し、`nPublic` が 1 であることを確認したあと、`experimental/sepolia/contracts/Groth16Verifier.sol` を書き出します。実行するとそのファイルを置き換えます。5 信号の `Groth16VerifierV2.sol` を書くのは `experimental/mini-0.2.0/sepolia/scripts/export-verifier.js` で、`nPublic` が 5 であることを要求し、デプロイ済み `Groth16Verifier.sol` のバイト列が変わっていれば停止します。テンプレートは Ethereum の BN254 プリコンパイル（アドレス 6、7、8）を使います。デプロイ記録が指す検証器は、公開信号 1 個の `Groth16Verifier.sol` です。

`AegisProofMiniSepolia` は 1 信号の `Groth16Verifier` を継承します。未追跡の `AegisProofMiniStatement` は 5 信号の `Groth16VerifierV2` を継承し、公開ネットワークへはデプロイしていません。

- `publicSignalCount()` は 1 を返す
- `verifyProof` は view。読み取りの `eth_call` で成否が分かる
- `verifyAndRecord` は、結果を状態と `VerificationRecorded` に残すトランザクション用の関数

生成された `verifyProof` は assembly の `return` で呼び出し全体を終えます。そのため `verifyAndRecord` は、同じ関数内で直接呼ばず、`staticcall` で `verifyProof` を実行してから bool と commitment を保存します。

証明の座標は、手で並べ替えず、`snarkjs.groth16.exportSolidityCallData` の出力を使います。

コントラクトが検査するのは Groth16 だけです。SHA-256 の成果物完全性も、ML-DSA-87 の真正性も、チェーン上では実行しません。true は、その検証器に埋め込まれた verification key の下で証明が受理されたことです。セットアップのエントロピーが破棄されたことや、`secret` の所持者を示すものではありません。デプロイ記録のアドレスとトランザクションは `sepolia.json` の記録であり、この文書を書いた時点のチェーン再照会ではありません。

`AegisProofMiniSepolia` の `verifyProof` は `uint[1]` です。引数の個数が違う呼び出しは ABI で一致せず revert し、状態は変わりません。`verifyAndRecord` に replay nonce はありません。成功でも失敗でも、`lastCommitment`、`lastValid`、`lastSender` をその呼び出しの値で上書きします。`AegisProofMiniStatement.verifyAndConsume` は、証明が有効なときだけ nullifier を記録します。呼び出し元は公開信号に束縛されません。

## Local proof generation

証明は既存の Core が作ります。`experimental/sepolia/scripts/sample-proof.cjs` は `src/prover/prove.js` と `src/verifier/verify.js` を呼び、オフチェーン検証が true の証明だけを Solidity の引数へ変換します。

デプロイ済みコントラクトへ送る凍結済み証明は、当時の `commitment` 1 個です。ルートの `prove` が作る証明も公開信号 1 個です。5 信号のローカル検査は `experimental/mini-0.2.0` の `AegisProofMiniStatement` が行います。`secret` は証明ファイルにも、チェーンへ送る引数にも入れません。

`npm run sepolia:test` は、デプロイ前でもローカルの Hardhat 上で次を確認します。

- 正しい証明と commitment で true
- 改ざんした proof、改ざんした commitment、別の publicSignals で false

凍結した 1 信号の証明を、ローカルの `AegisProofMiniSepolia` と記録上の Sepolia コントラクトで比べる処理は、`AEGIS_SEPOLIA_LIVE=1` かつ `experimental/sepolia/deployments/sepolia.json` かつ `SEPOLIA_RPC_URL` があるときだけ有効です。`.env` に RPC があるだけでは有効になりません。条件が揃わないときは skip です。この比較は `verifyProof` と `publicSignalCount` の読み取りです。`npm run sepolia:test` 自体はデプロイも状態変更トランザクションも送りません。公開ネットワークへの接続は、その明示フラグを付けた比較だけです。

## View verification

`npm run sepolia:verify` は、デプロイ済みコントラクトの `verifyProof` を view call します。トランザクションは送りません。結果が true でも、それはこの verification key の下で証明が受理されたことであり、成果物ファイルの完全性がチェーンで確認されたことにはなりません。

## State-changing verification

結果をブロックに残す必要があるときだけ `npm run sepolia:verify:tx` を使います。これは `verifyAndRecord` を 1 回送るためのコマンドです。読み取りだけでよい場合は view call で足ります。

## Secrets

RPC URL と秘密鍵は環境変数からのみ読みます。`.env.example` にある名前は次です。値は空です。

```text
SEPOLIA_RPC_URL=
SEPOLIA_PRIVATE_KEY=
SEPOLIA_VERIFIER_ADDRESS=
```

`.env` は `.gitignore` の対象です。秘密鍵、mnemonic、API key 付きの RPC URL は、ソース、README、deployment ファイルに書きません。`SEPOLIA_VERIFIER_ADDRESS` は任意です。記録済みのアドレスは deployment ファイルにあります。

デプロイスクリプトは、Hardhat network 名が `sepolia` であること、RPC の chain ID が `11155111` であること、chain ID が `1` でないこと、bytecode がコンパイル成果物と一致することを確認してから送ります。残高が不足しているときはトランザクションを送らずに停止します。そのときは Sepolia 用の公式 faucet を使います。README の「Sepolia Integration」に URL があります。mainnet の ETH は使いません。

## Deployment record

次の値は `experimental/sepolia/deployments/sepolia.json` に記録されている、1 回のデプロイと 1 回の検証トランザクションです。

| 項目 | 値 |
| --- | --- |
| Contract | `0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790` |
| Deployer | `0x23E7347D826Fe25dd709C52FB0036E793D54B8C0` |
| Deploy transaction | `0x48d7fc208986bcec01b28ca0806613969600584196c74b773440439d80f1bd4c` |
| Deploy block | 11866912 |
| Deploy status | 1 |
| Deploy gas used | 3513523 |
| Verification transaction | `0xee001b0be2d475973fc5292e3b2dab5df82d361eefc9875ea906a02eaae4749f` |
| Verification block | 11866927 |
| Verification status | 1 |
| Verification gas used | 433214 |
| `lastValid` | true |
| `lastCommitment` | `6572332521346552969132897450536910588528541939757210093019227709593248338264` |

- https://sepolia.etherscan.io/address/0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790
- https://sepolia.etherscan.io/tx/0x48d7fc208986bcec01b28ca0806613969600584196c74b773440439d80f1bd4c
- https://sepolia.etherscan.io/tx/0xee001b0be2d475973fc5292e3b2dab5df82d361eefc9875ea906a02eaae4749f

この検証で使った公開の証明座標は `experimental/sepolia/deployments/public-proof.json` にあります。

## Commands

```text
npm run sepolia:export-verifier
npm run sepolia:test
npm run sepolia:deploy
npm run sepolia:verify
npm run sepolia:verify:tx
```

## Limitations

- コントラクトの検証鍵は、このリポジトリの開発用単一貢献者セレモニーの鍵です。
- デプロイ済みコントラクトの公開信号は、記録当時の `commitment` 1 個です。5 信号のローカル検査は `AegisProofMiniStatement` です。
- チェーン上の true は Groth16 の受理であり、SHA-256 完全性や ML-DSA-87 真正性の確認ではありません。
- 上のアドレスとトランザクションは、記録されている 1 回のデプロイと 1 回の検証トランザクションです。
