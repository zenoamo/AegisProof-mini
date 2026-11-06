// SPDX-License-Identifier: GPL-3.0-or-later
// The circomlibjs package entry also loads ethers 5. Poseidon only needs this wasm builder.
export { buildPoseidon } from "../node_modules/circomlibjs/src/poseidon_wasm.js";
