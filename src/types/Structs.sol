pragma solidity ^0.8.0;

struct Call {
    address to;
    uint256 value;
    bytes data;
}

struct Approval {
    address operator;
    address token;
    uint256 amount;
    bytes32 domain;
    bytes32 salt;
}
