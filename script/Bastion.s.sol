pragma solidity ^0.8.0;

import {ERC20} from "solady/tokens/ERC20.sol";
import {Call, PackedUserOperation} from "../src/types/Structs.sol";
import {BastionFactory} from "../src/BastionFactory.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {Script} from "forge-std/Script.sol";

contract BastionScript is Script {
    function run() public {
        vm.startBroadcast();
        new BastionFactory(address(0));
        vm.stopBroadcast();
    }
}