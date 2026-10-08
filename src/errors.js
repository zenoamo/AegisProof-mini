// SPDX-License-Identifier: GPL-3.0-or-later

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
    this.code = "INPUT";
  }
}

export class ProofError extends Error {
  constructor(message, code = "PROOF_FAILED") {
    super(message);
    this.name = "ProofError";
    this.code = code;
  }
}

export class IntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "IntegrityError";
    this.code = "INTEGRITY";
  }
}

export class AuthenticityError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthenticityError";
    this.code = "AUTHENTICITY";
  }
}
