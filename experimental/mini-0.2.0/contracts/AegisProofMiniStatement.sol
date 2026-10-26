// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.0 <0.9.0;

import "./Groth16VerifierV2.sol";

/// Local experiment for the 5-signal statement.
/// This contract is not the deployed AegisProofMiniSepolia verifier.
/// Signal order: commitment, nullifier, contextHash, policyId, epoch.
/// The circuit binds policyId and epoch into the nullifier.
/// This contract separately rejects a reused nullifier, an epoch other than
/// the owner-set epoch, and a policyId that the owner has not allowed.
/// It does not prove policy rules or wall-clock time.
contract AegisProofMiniStatement is Groth16VerifierV2 {
    uint256 public constant PUBLIC_SIGNAL_COUNT = 5;
    uint256 public constant SIGNAL_COMMITMENT = 0;
    uint256 public constant SIGNAL_NULLIFIER = 1;
    uint256 public constant SIGNAL_CONTEXT_HASH = 2;
    uint256 public constant SIGNAL_POLICY_ID = 3;
    uint256 public constant SIGNAL_EPOCH = 4;

    address public owner;
    uint256 public currentEpoch;
    bool public epochIsSet;
    mapping(uint256 => bool) public allowedPolicy;
    mapping(uint256 => bool) public usedNullifiers;

    event NullifierConsumed(uint256 indexed nullifier, uint256 indexed epoch, address sender);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    function publicSignalCount() external pure returns (uint256) {
        return PUBLIC_SIGNAL_COUNT;
    }

    function setEpoch(uint256 epoch) external onlyOwner {
        currentEpoch = epoch;
        epochIsSet = true;
    }

    function setPolicyAllowed(uint256 policyId, bool allowed) external onlyOwner {
        allowedPolicy[policyId] = allowed;
    }

    function verifyAndConsume(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[5] calldata pubSignals
    ) external returns (bool) {
        require(epochIsSet, "epoch unset");
        require(pubSignals[SIGNAL_EPOCH] == currentEpoch, "epoch rejected");
        require(allowedPolicy[pubSignals[SIGNAL_POLICY_ID]], "policy rejected");
        require(!usedNullifiers[pubSignals[SIGNAL_NULLIFIER]], "nullifier used");

        (bool ok, bytes memory data) = address(this).staticcall(
            abi.encodeWithSelector(this.verifyProof.selector, pA, pB, pC, pubSignals)
        );
        require(ok && data.length >= 32, "verify call failed");
        require(abi.decode(data, (bool)), "invalid proof");

        usedNullifiers[pubSignals[SIGNAL_NULLIFIER]] = true;
        emit NullifierConsumed(pubSignals[SIGNAL_NULLIFIER], pubSignals[SIGNAL_EPOCH], msg.sender);
        return true;
    }
}
