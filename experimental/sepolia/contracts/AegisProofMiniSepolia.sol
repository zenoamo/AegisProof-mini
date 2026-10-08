// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.0 <0.9.0;

import "./Groth16Verifier.sol";

/// @title AegisProof-mini Sepolia verification wrapper.
/// @notice Groth16 on BN254. The generated verifier uses snarkjs curve name bn128.
///         The only public signal is `commitment`, where commitment = Poseidon(secret).
/// @dev Groth16Verifier is generated from keys/verification_key.json. This wrapper does
///      not check SHA-256 artifact integrity or ML-DSA-87. A true result means this
///      verification key accepted the proof. It does not show that setup entropy was
///      destroyed, and it does not identify the holder of `secret`.
contract AegisProofMiniSepolia is Groth16Verifier {
    uint256 public constant PUBLIC_SIGNAL_COUNT = 1;

    event VerificationRecorded(uint256 indexed commitment, bool valid, address indexed sender);

    uint256 public lastCommitment;
    bool public lastValid;
    address public lastSender;

    function publicSignalCount() external pure returns (uint256) {
        return PUBLIC_SIGNAL_COUNT;
    }

    /// @notice Records one Groth16 check. A read-only caller should use verifyProof.
    /// @dev verifyProof returns from inline assembly, so this function staticcalls it
    ///      and then stores the bool. There is no replay nonce. A later call overwrites
    ///      lastCommitment, lastValid, and lastSender, including when the proof is false.
    ///      Calldata that does not match uint[2], uint[2][2], uint[2], uint[1] reverts
    ///      in the ABI decoder and does not change state. A public signal outside the
    ///      BN254 scalar field makes verifyProof return false; this function still records it.
    /// @param pubSignals The single public commitment.
    /// @return valid True only when verifyProof accepts this proof and commitment.
    function verifyAndRecord(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[1] calldata pubSignals
    ) external returns (bool valid) {
        (bool ok, bytes memory data) = address(this).staticcall(
            abi.encodeWithSelector(this.verifyProof.selector, pA, pB, pC, pubSignals)
        );
        require(ok && data.length >= 32, "verify call failed");
        valid = abi.decode(data, (bool));
        lastCommitment = pubSignals[0];
        lastValid = valid;
        lastSender = msg.sender;
        emit VerificationRecorded(pubSignals[0], valid, msg.sender);
    }
}
