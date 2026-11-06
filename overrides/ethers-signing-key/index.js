// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";

// ethers 5 loads this module while importing utils. This tree never constructs
// an ethers 5 SigningKey. elliptic (GHSA-848j-6mx2-7j84) is therefore not installed.
function unavailable() {
  throw new Error("@ethersproject/signing-key is not available. This project signs with ethers v6.");
}

class SigningKey {
  constructor() {
    unavailable();
  }

  static isSigningKey(value) {
    return Boolean(value && value._isSigningKey === true);
  }
}

module.exports = {
  SigningKey,
  computePublicKey: unavailable,
  recoverPublicKey: unavailable,
};
