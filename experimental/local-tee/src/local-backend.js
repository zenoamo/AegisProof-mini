// SPDX-License-Identifier: GPL-3.0-or-later
// Ordinary local Node.js process. Not a TEE, and not hardware isolation.
import { prove } from "../../../src/index.js";
import { hasSecretField } from "./envelope.js";

export const LOCAL_BACKEND_IDENTITY = Object.freeze({
  id: "local-process",
  kind: "local-process",
  claims: Object.freeze({
    hardwareIsolation: false,
    remoteAttestation: false,
  }),
  attestation: null,
});

export function createLocalBackend(deps = {}) {
  const proveCommitment = deps.prove ?? prove;

  return {
    async identify() {
      return {
        id: LOCAL_BACKEND_IDENTITY.id,
        kind: LOCAL_BACKEND_IDENTITY.kind,
        claims: {
          hardwareIsolation: false,
          remoteAttestation: false,
        },
        attestation: null,
      };
    },

    // `secret` crosses this function boundary and must not be copied into the return value.
    async prove(request) {
      if (!request || typeof request !== "object" || Array.isArray(request)) {
        throw new Error("バックエンド入力が不正です");
      }
      const names = ["secret", "context", "policyId", "epoch", "commitment", "nullifier", "contextHash"];
      if (names.some((name) => typeof request[name] !== "string")) {
        throw new Error("バックエンド入力が不正です");
      }
      const envelope = await proveCommitment({
        secret: request.secret,
        context: request.context,
        policyId: request.policyId,
        epoch: request.epoch,
        commitment: request.commitment,
        nullifier: request.nullifier,
        contextHash: request.contextHash,
      });
      if (hasSecretField(envelope)) {
        throw new Error("バックエンド応答が不正です");
      }
      return { commitment: request.commitment, envelope };
    },
  };
}
