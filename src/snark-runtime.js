// SPDX-License-Identifier: GPL-3.0-or-later
let tail = Promise.resolve();

// Groth16 prove/verify share one queue so their wasm workers are not interleaved.
// snarkjs keeps those workers alive; the CLI and build call process.exit, and
// the test runner is started with --test-force-exit.
export function enqueueSnark(task) {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
