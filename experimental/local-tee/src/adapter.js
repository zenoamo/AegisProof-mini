// SPDX-License-Identifier: GPL-3.0-or-later
// Application-side adapter. A backend is injected and is not trusted.
// Secret stays in the arguments to the backend. The public result carries only
// the commitment and the existing proof envelope.
import { readEnvelope, statementFromParts, verify } from "../../mini-0.2.0/src/index.js";
import { InputError } from "../../../src/errors.js";
import { parseFieldElement } from "../../../src/field.js";
import {
  TeeBoundaryError,
  assertNoSecretField,
  createPublicResult,
  hasSecretField,
} from "./envelope.js";
import { createLocalBackend } from "./local-backend.js";

const REQUEST_KEYS = new Set(["secret", "context", "policyId", "epoch", "commitment"]);

function asBackendError(err, secret) {
  if (err instanceof TeeBoundaryError && (typeof secret !== "string" || !err.message.includes(secret))) {
    return err;
  }
  return new TeeBoundaryError("バックエンド処理に失敗しました", "BACKEND");
}

function requireField(input, name) {
  if (!Object.hasOwn(input, name)) throw new InputError(`${name} がありません`);
  return parseFieldElement(input[name], name).toString();
}

function readRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InputError("入力オブジェクトが不正です");
  }
  for (const key of Object.keys(input)) {
    if (!REQUEST_KEYS.has(key)) {
      throw new InputError("入力に未知のフィールドがあります");
    }
  }
  const secret = requireField(input, "secret");
  const context = requireField(input, "context");
  const policyId = requireField(input, "policyId");
  const epoch = requireField(input, "epoch");
  let commitment;
  if (Object.hasOwn(input, "commitment")) {
    commitment = parseFieldElement(input.commitment, "commitment").toString();
  }
  return { secret, context, policyId, epoch, commitment };
}

function acceptIdentity(identity) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    throw new TeeBoundaryError("バックエンド識別情報が不正です");
  }
  if (typeof identity.id !== "string" || typeof identity.kind !== "string") {
    throw new TeeBoundaryError("バックエンド識別情報が不正です");
  }
  if (!identity.claims || identity.claims.hardwareIsolation !== false || identity.claims.remoteAttestation !== false) {
    throw new TeeBoundaryError("未検証の TEE 保証を主張するバックエンドは受理できません");
  }
  if (identity.attestation !== null) {
    throw new TeeBoundaryError("未検証のアテステーションは受理できません");
  }
  return {
    id: identity.id,
    kind: identity.kind,
    claims: {
      hardwareIsolation: false,
      remoteAttestation: false,
    },
  };
}

function acceptBackendResult(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new TeeBoundaryError("バックエンド応答が不正です");
  }
  if (hasSecretField(response)) {
    throw new TeeBoundaryError("バックエンド応答に秘密入力が含まれています");
  }
  if (typeof response.commitment !== "string") {
    throw new TeeBoundaryError("バックエンド応答の commitment が不正です");
  }
  assertNoSecretField(response.envelope, "証明エンベロープ");
  return response;
}

export function createAdapter(backend = createLocalBackend(), deps = {}) {
  const buildStatement = deps.statement ?? statementFromParts;
  const checkEnvelope = deps.readEnvelope ?? readEnvelope;
  const verifyProof = deps.verify ?? verify;
  if (!backend || typeof backend.identify !== "function" || typeof backend.prove !== "function") {
    throw new TeeBoundaryError("バックエンドインターフェースが不足しています");
  }

  return {
    backend,
    async prove(input) {
      const request = readRequest(input);
      let identity;
      try {
        identity = acceptIdentity(await backend.identify());
      } catch (err) {
        throw asBackendError(err, request.secret);
      }

      const statement = await buildStatement({
        secret: BigInt(request.secret),
        context: BigInt(request.context),
        policyId: BigInt(request.policyId),
        epoch: BigInt(request.epoch),
      });
      if (request.commitment !== undefined && request.commitment !== statement.commitment) {
        throw new TeeBoundaryError("commitment が Poseidon コミットメントと一致しません");
      }

      let response;
      try {
        response = await backend.prove({
          secret: request.secret,
          context: request.context,
          policyId: request.policyId,
          epoch: request.epoch,
          commitment: statement.commitment,
          nullifier: statement.nullifier,
          contextHash: statement.contextHash,
        });
      } catch (err) {
        throw asBackendError(err, request.secret);
      }

      const accepted = acceptBackendResult(response);
      if (accepted.commitment !== statement.commitment) {
        throw new TeeBoundaryError("バックエンドの commitment が一致しません");
      }
      const envelope = checkEnvelope(accepted.envelope);
      if (!envelope) {
        throw new TeeBoundaryError("証明エンベロープの形式が不正です");
      }
      if (envelope.publicSignals.length !== statement.publicSignals.length || envelope.publicSignals.some((value, index) => value !== statement.publicSignals[index])) {
        throw new TeeBoundaryError("公開シグナルが commitment と一致しません");
      }
      if ((await verifyProof(envelope)) !== true) {
        throw new TeeBoundaryError("証明検証に失敗しました");
      }

      return createPublicResult({
        backend: identity,
        commitment: statement.commitment,
        proofEnvelope: envelope,
      });
    },
  };
}
