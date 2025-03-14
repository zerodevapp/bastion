pragma solidity ^0.8.0;

import {Bastion} from "src/Bastion.sol";
import {BastionFactory} from "src/BastionFactory.sol";
import {Approval, Call} from "src/types/Structs.sol";
import {Test} from "forge-std/Test.sol";
import {Vm, VmSafe} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";
import {ERC20} from "solady/tokens/ERC20.sol";

contract Mock {
    uint256 public bar;

    function foo() external {
        bar++;
    }
}

contract MockERC20 is ERC20 {
    function name() public pure override returns (string memory) {
        return "Mock";
    }

    function symbol() public pure override returns (string memory) {
        return "MOCK";
    }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}

contract BastionTest is Test {
    BastionFactory public factory;
    address owner;
    uint256 ownerKey;

    address operator;
    uint256 operatorKey;

    MockERC20 token;

    function setUp() external {
        factory = new BastionFactory();
        (owner, ownerKey) = makeAddrAndKey("Owner");
        (operator, operatorKey) = makeAddrAndKey("Opeartor");
        token = new MockERC20();
    }

    function testCheckDelegation() external {
        bytes32 salt = bytes32(0);
        address expectedBastion = address(0);
        uint256 count = 0;

        uint256 allowance = 100;

        uint8 v;
        bytes32 r;
        bytes32 s;

        token.mint(owner, 10000);

        vm.prank(owner);
        token.approve(address(factory), 5000);

        assertEq(token.allowance(owner, address(factory)), 5000);

        Approval memory approval = Approval({
            operator: operator,
            token: address(token),
            amount: allowance,
            domain: keccak256(abi.encodePacked("https://dashboard.zerodev.app")),
            salt: salt
        });

        while (expectedBastion == address(0)) {
            approval.salt = keccak256(abi.encodePacked(approval.salt));
            bytes32 approvalDigest = factory.getDigest(approval);
            (v, r, s) = vm.sign(ownerKey, approvalDigest);
            expectedBastion = factory.getBastionAddress(block.chainid, v, r, s);
            count++;
        }
        console.log("Expected Bastion : ", expectedBastion);
        console.log("Salt : ");
        console.logBytes32(approval.salt);
        console.log("Iteration : ", count);

        Bastion bastion = Bastion(expectedBastion);

        VmSafe.SignedDelegation memory auth =
            VmSafe.SignedDelegation({v: v - 27, r: r, s: s, nonce: uint64(0), implementation: address(factory.impl())});

        Mock m = new Mock();

        /// Designate the next call as an EIP-7702 transaction.
        vm.attachDelegation(auth);
        //vm.etch(expectedBastion, abi.encodePacked(hex"ef0100", impl));
        m.foo();

        assertEq(m.bar(), 1);

        factory.checkSig(approval, block.chainid, v, r, s);

        assertEq(bastion.owner(), owner);
        assertEq(factory.allowance(owner, address(bastion), address(token)), allowance);

        Call[] memory calls = new Call[](1);
        calls[0] = Call({to: address(m), value: 0, data: abi.encodeWithSelector(Mock.foo.selector)});

        vm.prank(owner);
        bastion.executeWithAllowance(calls, address(token), 10);

        assertEq(factory.allowance(owner, address(bastion), address(token)), allowance - 10);
        assertEq(token.allowance(owner, address(factory)), 5000 - 10);
        assertEq(token.balanceOf(owner), 10000 - 10);
        assertEq(token.balanceOf(address(bastion)), 10);
        assertEq(m.bar(), 2);
    }
}
