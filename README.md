# Bastion

Bastion is a smart contract wallet system built on EIP-7702 that enables secure token delegation and execution with fine-grained allowance controls.

## Overview

Bastion provides a counterfactual smart contract wallet with:

1. **Signature-based wallet creation** - Create wallets on-demand using signatures without deploying contracts upfront
2. **Token allowance system** - Grant allowances to operators to spend specific tokens on your behalf
3. **Delegated execution** - Let operators execute transactions using your wallet with specified token allowances

## Architecture

The system consists of three main components:

1. **BastionFactory** - Contract factory responsible for:
   - Handling signature verification for wallet creation
   - Managing token allowances between owners and their Bastion wallets
   - Using EIP-712 for secure typed data signing

2. **Bastion** - The wallet contract that:
   - Executes transactions with token allowances
   - Enforces owner and operator permissions
   - Processes batched transaction calls

3. **EIP-7702 Integration** - The system leverages EIP-7702, which enables:
   - Creation of counterfactual contract wallets with minimal bytecode
   - Delegated execution to implementations without changing wallet addresses
   - Efficient and secure wallet initialization

## Wallet Creation From Approval Signatures

Bastion uses a unique approach where simple EIP-712 signatures generate counterfactual wallets without requiring specialized EIP-7702 signing:

### Technical Implementation example

```solidity
// use EIP-712 to find out who actually signed for the approval
function checkSig(Approval memory approval, uint256 _chainId, uint8 v, bytes32 r, bytes32 s) external {
    address session = getBastionAddress(_chainId, v, r, s);
    bytes32 digest = getDigest(approval);
    address signer = ecrecover(digest, v, r, s);
    require(signer != address(0), InvalidSigFormat());
    Bastion(session).initialize(signer, approval.operator);
    allowance[signer][session][approval.token] = approval.amount;
}

// Derive Bastion address from same signature used for eip712, but uses eip-7702 hash to find out the address
function getBastionAddress(uint256 _chainId, uint8 _v, bytes32 _r, bytes32 _s) public view returns (address) {
    bytes32 h = keccak256(abi.encodePacked(hex"05", LibRLP.p(_chainId).p(address(impl)).p(0).encode()));
    return ecrecover(h, _v, _r, _s);
}
```

### Key Advantages

1. **Only Requires Standard Signing Popups**:
   - Users can create Bastion wallets using familiar EIP-712 approval signatures
   - No need for specialized EIP-7702 signing popups or wallet modifications
   - Works with any existing wallet software that supports EIP-712

2. **Seamless User Experience**:
   - Single signature flow for both approval and wallet creation
   - Users see a familiar "approve tokens" interface rather than complex account creation
   - Reduces friction by leveraging existing wallet interfaces

3. **Implementation Details**:
   - The signature components (v, r, s) from the approval are reused for EIP-7702 address derivation
   - Same signature both authorizes token spending and deterministically generates the Bastion wallet
   - Factory validates the approval signature while simultaneously using it to compute the wallet address

## Use Cases

- **Session Keys**: Create temporary operator permissions with limited token allowances
- **Dapp Interaction**: Allow dapps to execute transactions on your behalf with controlled spending limits

## Development

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

## Security

The contracts use a combination of EIP-712 typed data signing and EIP-7702 account abstraction to ensure security:

- Signatures are used to verify ownership for wallet creation
- Allowances are strictly enforced for token spending
- Owner and operator permissions are checked for all executions

## License

This project is licensed under the MIT License.
