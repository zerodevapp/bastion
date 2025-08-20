pragma solidity ^0.8.0;

import {Approval} from "./types/Structs.sol";
import {EIP712} from "solady/utils/EIP712.sol";
import {LibRLP} from "solady/utils/LibRLP.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {Bastion} from "./Bastion.sol";
import {ERC20} from "solady/tokens/ERC20.sol";

contract BastionFactory is EIP712 {
    Bastion public immutable impl;

    error InvalidDelegationSig();
    error InvalidSigFormat();

    using LibRLP for LibRLP.List;

    constructor(address ep) {
        impl = new Bastion(ep);
    }

    function _domainNameAndVersion() internal view override returns (string memory, string memory) {
        return ("BastionFactory", "0.0.0-beta");
    }

    bytes32 APPROVAL_TYPE_HASH = keccak256(
        abi.encodePacked("Approval(bytes operator,address token,uint256 amount,bytes32 domain,bytes32 salt)")
    );

    mapping(address owner => mapping(address session => mapping(address token => uint256))) public allowance;

    function checkSig(Approval memory approval, uint256 _chainId, uint8 v, bytes32 r, bytes32 s) external {
        address session = getBastionAddress(_chainId, v, r, s);
        bytes32 digest = getDigest(approval);
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), InvalidSigFormat());
        Bastion(session).initialize(signer, approval.operator);
        allowance[signer][session][approval.token] = approval.amount;
    }

    function consume(address _owner, address _token, uint256 _amount) external {
        allowance[_owner][msg.sender][_token] -= _amount;
        ERC20(_token).transferFrom(_owner, msg.sender, _amount);
    }

    // use owner's signature before doing xor to get the address
    function getBastionAddress(uint256 _chainId, uint8 _v, bytes32 _r, bytes32 _s) public view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(hex"05", LibRLP.p(_chainId).p(address(impl)).p(0).encode()));
        return ecrecover(h, _v, _r, _s);
    }

    function getDigest(Approval memory approval) public view returns (bytes32) {
        return _hashTypedData(
            keccak256(
                abi.encode(
                    APPROVAL_TYPE_HASH,
                    keccak256(abi.encodePacked(approval.operator)),
                    approval.token,
                    approval.amount,
                    approval.domain,
                    approval.salt
                )
            )
        );
    }
}
