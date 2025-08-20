pragma solidity ^0.8.0;

import {ERC20} from "solady/tokens/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20() {
        _mint(msg.sender, 1000000000000000000000000);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function name() public view virtual override returns (string memory) {
        return "MockERC20";
    }

    function symbol() public view virtual override returns (string memory) {
        return "MOCK";
    }
}