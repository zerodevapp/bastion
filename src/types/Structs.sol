pragma solidity ^0.8.0;

struct Call {
    address to;
    uint256 value;
    bytes data;
}

struct Approval {
    bytes operator;
    address token;
    uint256 amount;
    bytes32 domain;
    bytes32 salt;
}

struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees; //maxPriorityFee and maxFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}
