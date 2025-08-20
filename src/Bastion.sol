pragma solidity ^0.8.0;

import {ERC20} from "solady/tokens/ERC20.sol";
import {Call, PackedUserOperation} from "./types/Structs.sol";
import {BastionFactory} from "./BastionFactory.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";

address constant RIP7212_VERIFIER = 0x0000000000000000000000000000000000000100;

contract Bastion {
    address public immutable ENTRYPOINT;

    address public owner;

    bytes public operator;

    BastionFactory public immutable FACTORY;

    error OnlyFactory();
    error OnlyOwnerOrOperator();
    error OnlyEntryPoint();
    error OnlyOwner();
    error CallFailed();
    error InvalidOperatorData();

    constructor(address ep) {
        FACTORY = BastionFactory(msg.sender);
        ENTRYPOINT = ep;
    }

    function initialize(address _owner, bytes calldata _operator) external {
        require(msg.sender == address(FACTORY), OnlyFactory());
        require(_operator.length == 20 || _operator.length == 64, InvalidOperatorData());
        owner = _owner;
        operator = _operator;
    }

    function transferOwner(address _owner) external {
        require(msg.sender == owner, OnlyOwner());
        owner = _owner;
    }

    function changeOperator(bytes calldata _operator) external {
        require(msg.sender == owner, OnlyOwner());
        require(_operator.length == 20 || _operator.length == 64, InvalidOperatorData());
        operator = _operator;
    }

    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
        external
        payable
        returns (uint256 validationData)
    {
        require(msg.sender == ENTRYPOINT, OnlyEntryPoint());
        return _verifySignature(userOpHash, userOp.signature) ? 0 : 1;
    }

    function executeWithAllowance(Call[] calldata calls, address _token, uint256 _amount) external {
        require(msg.sender == owner || msg.sender == ENTRYPOINT || (operator.length == 20 && msg.sender == address(bytes20(operator))), OnlyOwnerOrOperator());
        FACTORY.consume(owner, _token, _amount);
        for (uint256 i = 0; i < calls.length; i++) {
            Call calldata c = calls[i];
            (bool success, bytes memory ret) = c.to.call{value: c.value}(c.data);
            if (!success) {
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
    }

    function _verifySignature(bytes32 hash, bytes calldata signature) internal view returns(bool) {
        if(operator.length == 20) {
            return address(bytes20(operator)) == ECDSA.recover(hash, signature);
        } else if (operator.length == 64) {
            // only using rip7212 for demo
            bytes memory args = abi.encode(hash, bytes32(signature), bytes32(signature[32:]), operator);
            (bool success, bytes memory ret) = RIP7212_VERIFIER.staticcall(args);
            if (success == false || ret.length == 0) {
                return false;
            }
            return abi.decode(ret, (uint256)) == 1;

        } else {
            revert InvalidOperatorData();
        }
    }
}
