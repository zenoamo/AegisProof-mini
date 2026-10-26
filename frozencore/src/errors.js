// SPDX-License-Identifier: GPL-3.0-or-later
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
    this.code = "INPUT";
  }
}

export class ProofError extends Error {
  constructor(message, code = "PROOF") {
    super(message);
    this.name = "ProofError";
    this.code = code;
  }
}
