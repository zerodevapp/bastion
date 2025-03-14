pragma solidity ^0.8.0;

import {ERC20} from "solady/tokens/ERC20.sol";
import {Call} from "./types/Structs.sol";
import {ContainerFactory} from "./ContainerFactory.sol";

contract Container {
    address public owner;

    address public operator;

    ContainerFactory public immutable FACTORY;

    error OnlyFactory();
    error OnlyOwnerOrOperator();
    error CallFailed();

    constructor() {
        FACTORY = ContainerFactory(msg.sender);
    }

    function initialize(address _owner, address _operator) external {
        require(msg.sender == address(FACTORY), OnlyFactory());
        owner = _owner;
        operator = _operator;
    }

    function executeWithAllowance(Call[] calldata calls, address _token, uint256 _amount) external {
        require(msg.sender == owner || msg.sender == operator, OnlyOwnerOrOperator());
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
}
