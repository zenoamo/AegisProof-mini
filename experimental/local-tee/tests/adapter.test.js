// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SCHEMA, VERSION, PUBLIC_SIGNALS } from "../../mini-0.2.0/src/constants.js";
import * as rootApi from "../../../src/index.js";
import * as mini020 from "../../mini-0.2.0/src/index.js";
import { createAdapter } from "../src/adapter.js";
import { TeeBoundaryError, hasSecretField, parsePublicResult, serializePublicResult } from "../src/envelope.js";
import { createLocalBackend } from "../src/local-backend.js";

const SECRET = "900000000000000000000000000042";
const SCOPE = { context: "11", policyId: "7", epoch: "3" };

function proofShape(publicSignals) {
  return {
    version: VERSION,
    schema: SCHEMA,
    protocol: "groth16",
    curve: "bn254",
    publicSignals,
    proof: {
      protocol: "groth16",
      curve: "bn128",
      pi_a: ["1", "2", "1"],
      pi_b: [["1", "2"], ["3", "4"], ["1", "0"]],
      pi_c: ["1", "2", "1"],
    },
  };
}

function localIdentity() {
  return {
    id: "local-process",
    kind: "local-process",
    claims: { hardwareIsolation: false, remoteAttestation: false },
    attestation: null,
  };
}

function statementOf({ secret, context, policyId, epoch }) {
  const commitment = (secret + 1n).toString();
  const contextHash = (context + 2n).toString();
  const nullifier = (secret + context + policyId + epoch).toString();
  const policy = policyId.toString();
  const epochText = epoch.toString();
  return {
    secret: secret.toString(),
    context: context.toString(),
    policyId: policy,
    epoch: epochText,
    commitment,
    contextHash,
    nullifier,
    publicSignals: [commitment, nullifier, contextHash, policy, epochText],
  };
}

function backendReturning(prove) {
  return {
    async identify() {
      return localIdentity();
    },
    prove,
  };
}

function acceptingBackend() {
  return backendReturning(async (request) => ({
    commitment: request.commitment,
    envelope: proofShape([
      request.commitment,
      request.nullifier,
      request.contextHash,
      request.policyId,
      request.epoch,
    ]),
  }));
}

function adapterWith(backend, verify = async () => true) {
  return createAdapter(backend, {
    statement: statementOf,
    verify,
  });
}

function request(extra = {}) {
  return { secret: SECRET, ...SCOPE, ...extra };
}

test("the 0.1.0 package export does not gain the 0.2.0 statement builder", () => {
  assert.equal(Object.hasOwn(rootApi, "statementFromParts"), false);
  assert.equal(rootApi.PUBLIC_SIGNALS.length, 1);
  assert.equal(typeof mini020.statementFromParts, "function");
  assert.equal(PUBLIC_SIGNALS.length, 5);
  assert.equal(mini020.PUBLIC_SIGNALS.length, 5);
});

describe("local tee adapter", () => {
  test("local backend exposes the injected interface and no tee claim", async () => {
    const backend = createLocalBackend({
      prove: async ({ commitment, nullifier, contextHash, policyId, epoch }) =>
        proofShape([commitment, nullifier, contextHash, policyId, epoch]),
    });
    assert.equal(typeof backend.identify, "function");
    assert.equal(typeof backend.prove, "function");
    const identity = await backend.identify();
    assert.deepEqual(identity, await backend.identify());
    assert.equal(identity.kind, "local-process");
    assert.equal(identity.claims.hardwareIsolation, false);
    assert.equal(identity.claims.remoteAttestation, false);
    assert.equal(identity.attestation, null);
    assert.equal(Object.hasOwn(identity, "quote"), false);
    const result = await backend.prove({
      secret: "7",
      context: "11",
      policyId: "7",
      epoch: "3",
      commitment: "8",
      nullifier: "9",
      contextHash: "10",
    });
    assert.equal(result.commitment, "8");
    assert.equal(hasSecretField(result), false);
  });

  test("local backend does not log the secret", async () => {
    const seen = [];
    const methods = ["log", "info", "debug", "error", "warn"];
    const previous = {};
    for (const name of methods) {
      previous[name] = console[name];
      console[name] = (...args) => seen.push(args.map(String).join(" "));
    }
    try {
      const backend = createLocalBackend({
        prove: async ({ commitment, nullifier, contextHash, policyId, epoch }) =>
          proofShape([commitment, nullifier, contextHash, policyId, epoch]),
      });
      await backend.prove({
        secret: SECRET,
        context: "11",
        policyId: "7",
        epoch: "3",
        commitment: "8",
        nullifier: "9",
        contextHash: "10",
      });
      assert.equal(seen.join("\n").includes(SECRET), false);
    } finally {
      for (const name of methods) console[name] = previous[name];
    }
  });

  test("accepts a valid request and keeps the secret out of the public result", async () => {
    const result = await adapterWith(acceptingBackend()).prove(request());
    assert.equal(result.commitment, statementOf({
      secret: BigInt(SECRET),
      context: 11n,
      policyId: 7n,
      epoch: 3n,
    }).commitment);
    assert.equal(result.proofEnvelope.publicSignals[0], result.commitment);
    assert.equal(result.schema, "aegisproof-mini-local-tee-result-v1");
    assert.notEqual(result.schema, SCHEMA);
    assert.equal(result.verified.hardwareIsolation, false);
    assert.equal(result.verified.remoteAttestation, false);
    assert.equal(result.verified.attestation, null);
    assert.equal(result.backend.attestation, null);
    assert.equal(hasSecretField(result), false);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
    const parsed = parsePublicResult(JSON.parse(serializePublicResult(result)));
    assert.equal(parsed.commitment, result.commitment);
  });

  test("rejects invalid, missing, and unknown request fields", async () => {
    const adapter = adapterWith(acceptingBackend());
    await assert.rejects(adapter.prove(request({ secret: "12abc34" })), (err) => {
      assert.equal(err.message.includes("12abc34"), false);
      return true;
    });
    await assert.rejects(adapter.prove(request({ secret: "01" })), (err) => {
      assert.equal(err.message.includes("01"), false);
      return true;
    });
    await assert.rejects(adapter.prove(request({ secret: 7 })));
    await assert.rejects(adapter.prove({}), /secret がありません/);
    const withoutContext = request();
    delete withoutContext.context;
    await assert.rejects(adapter.prove(withoutContext), /context がありません/);
    await assert.rejects(adapter.prove(null));
    await assert.rejects(adapter.prove(request({ note: "extra" })), /未知のフィールド/);
    await assert.rejects(
      adapter.prove(request({ commitment: "1" })),
      /Poseidon コミットメントと一致しません/,
    );
  });

  test("rejects a malformed backend response and a failed verification", async () => {
    const adapter = adapterWith(acceptingBackend());
    await assert.rejects(adapterWith(backendReturning(async () => null)).prove(request()), /バックエンド応答が不正です/);
    await assert.rejects(
      adapterWith(backendReturning(async () => ({ commitment: "1" }))).prove(request()),
      TeeBoundaryError,
    );
    await assert.rejects(
      adapterWith(backendReturning(async (request) => ({
        commitment: request.commitment,
        envelope: {
          ...proofShape([request.commitment, request.nullifier, request.contextHash, request.policyId, request.epoch]),
          version: "other",
        },
      }))).prove(request()),
      /証明エンベロープの形式が不正です/,
    );
    await assert.rejects(
      adapterWith(backendReturning(async (request) => ({
        secret: request.secret,
        commitment: request.commitment,
        envelope: proofShape([
          request.commitment,
          request.nullifier,
          request.contextHash,
          request.policyId,
          request.epoch,
        ]),
      }))).prove(request()),
      (err) => {
        assert.equal(err.message.includes(SECRET), false);
        assert.match(err.message, /秘密入力/);
        return true;
      },
    );
    await assert.rejects(
      adapterWith(backendReturning(async (request) => ({
        valid: true,
        commitment: request.commitment,
        envelope: proofShape(["1", request.nullifier, request.contextHash, request.policyId, request.epoch]),
      }))).prove(request()),
      /公開シグナルが commitment と一致しません/,
    );
    let returned = false;
    try {
      await adapterWith(acceptingBackend(), async () => false).prove(request());
      returned = true;
    } catch (err) {
      assert.equal(err instanceof TeeBoundaryError, true);
      assert.equal(err.message, "証明検証に失敗しました");
    }
    assert.equal(returned, false);
    assert.equal(adapter.backend !== undefined, true);
  });

  test("wraps a backend error without copying the secret", async () => {
    const adapter = adapterWith(backendReturning(async (request) => {
      throw new Error(`failed ${request.secret}`);
    }));
    await assert.rejects(adapter.prove(request()), (err) => {
      assert.equal(err instanceof TeeBoundaryError, true);
      assert.equal(err.message, "バックエンド処理に失敗しました");
      assert.equal(err.message.includes(SECRET), false);
      assert.equal(JSON.stringify(err).includes(SECRET), false);
      return true;
    });
  });

  test("rejects schema or version mismatches and unverified tee claims", async () => {
    const result = await adapterWith(acceptingBackend()).prove(request());
    assert.throws(() => parsePublicResult({ ...result, schema: "other" }), /schema または version/);
    assert.throws(() => parsePublicResult({ ...result, version: "other" }), /schema または version/);
    assert.throws(() => parsePublicResult({ ...result, note: "extra" }), /未知のフィールド/);
    assert.throws(
      () => parsePublicResult({
        ...result,
        backend: { ...result.backend, attestation: { quote: "not-verified" } },
      }),
      /アテステーション/,
    );
    assert.throws(
      () => parsePublicResult({
        ...result,
        verified: { hardwareIsolation: true, remoteAttestation: false, attestation: null },
      }),
      /検証済みの TEE 保証/,
    );
    await assert.rejects(
      adapterWith({
        async identify() {
          return { ...localIdentity(), claims: { hardwareIsolation: true, remoteAttestation: false } };
        },
        async prove() {
          throw new Error("must not prove");
        },
      }).prove(request()),
      (err) => {
        assert.match(err.message, /未検証の TEE 保証/);
        assert.equal(err.message.includes(SECRET), false);
        return true;
      },
    );
    await assert.rejects(
      adapterWith({
        async identify() {
          return { ...localIdentity(), attestation: { status: "ok" } };
        },
        async prove() {
          return null;
        },
      }).prove(request()),
      /アテステーション/,
    );
    assert.throws(() => createAdapter({}), TeeBoundaryError);
  });
});
