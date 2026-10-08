// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.0 <0.9.0;

import "./Groth16Verifier.sol";

/// AegisProof-mini Sepolia extension.
/// Groth16Verifier is generated from keys/verification_key.json.
/// The only public signal is commitment.
contract AegisProofMiniSepolia is Groth16Verifier {
    uint256 public constant PUBLIC_SIGNAL_COUNT = 1;

    event VerificationRecorded(uint256 indexed commitment, bool valid, address indexed sender);

    uint256 public lastCommitment;
    bool public lastValid;
    address public lastSender;

    function publicSignalCount() external pure returns (uint256) {
        return PUBLIC_SIGNAL_COUNT;
    }

    /// Sends a transaction so the verification result is recorded on Sepolia.
    /// A read-only check should call verifyProof instead.
    /// verifyProof returns from inline assembly, so a direct call would skip
    /// every statement after it. staticcall keeps that return inside the call.
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
