pragma solidity ^0.8.0;

import {MockERC20} from "../src/mock/MockERC20.sol";
import {Script} from "forge-std/Script.sol";

contract MockERC20Script is Script {
    function run() public {
        vm.startBroadcast();
        new MockERC20();
        vm.stopBroadcast();
    }
}