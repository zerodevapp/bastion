import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { sepolia } from 'viem/chains';

export const BASTION_FACTORY_ABI = [
  { name: 'impl', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'getDigest', type: 'function', stateMutability: 'view', inputs: [{
      name: 'approval', type: 'tuple', components: [
        { name: 'operator', type: 'bytes' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'domain', type: 'bytes32' },
        { name: 'salt', type: 'bytes32' },
      ],
  }], outputs: [{ type: 'bytes32' }] },
  { name: 'getBastionAddress', type: 'function', stateMutability: 'view', inputs: [
      { name: 'chainId', type: 'uint256' }, { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }
  ], outputs: [{ type: 'address' }] },
  { name: 'checkSig', type: 'function', stateMutability: 'nonpayable', inputs: [{
      name: 'approval', type: 'tuple', components: [
        { name: 'operator', type: 'bytes' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'domain', type: 'bytes32' },
        { name: 'salt', type: 'bytes32' },
      ],
  }, { name: 'chainId', type: 'uint256' }, { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }], outputs: [] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [
      { name: 'owner', type: 'address' }, { name: 'session', type: 'address' }, { name: 'token', type: 'address' }
  ], outputs: [{ type: 'uint256' }] },
] as const;

export const BASTION_ABI = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'operator', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes' }] },
  { name: 'changeOperator', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'operator', type: 'bytes' }], outputs: [] },
  { name: 'executeWithAllowance', type: 'function', stateMutability: 'payable', inputs: [
      { name: 'calls', type: 'tuple[]', components: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ] },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
  ], outputs: [] },
] as const;

export const ERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [
      { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }
  ], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [
      { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }
  ], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;

export const MOCK_TOKEN_ABI = [
  { name: 'mint', type: 'function', stateMutability: 'nonpayable', inputs: [
      { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }
  ], outputs: [] },
] as const;

export type Approval = {
  operator: `0x${string}`; // bytes
  token: `0x${string}`;
  amount: bigint;
  domain: `0x${string}`; // bytes32
  salt: `0x${string}`;   // bytes32
};

export function getPublicClient() {
  const url = import.meta.env.VITE_SEPOLIA_RPC_URL as string;
  if (!url) throw new Error('VITE_SEPOLIA_RPC_URL missing');
  return createPublicClient({ chain: sepolia, transport: http(url) });
}

export function getWalletClient() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('MetaMask not found');
  return createWalletClient({ chain: sepolia, transport: custom(eth) });
}

export function getFactoryAddress() {
  const addr = import.meta.env.VITE_FACTORY_ADDRESS as string;
  if (!addr) throw new Error('VITE_FACTORY_ADDRESS missing');
  return addr as `0x${string}`;
}



