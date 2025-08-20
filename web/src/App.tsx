import React, { useMemo, useState } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { createPublicClient, createWalletClient, custom, keccak256, toHex, stringToBytes, zeroAddress, parseUnits, getAddress, encodePacked, recoverTypedDataAddress, hashTypedData, encodeFunctionData } from 'viem';
import { sepolia } from 'viem/chains';
import { getPublicClient, getWalletClient, getFactoryAddress, ERC20_ABI, BASTION_FACTORY_ABI, BASTION_ABI, MOCK_TOKEN_ABI } from './lib/contracts';
import { generateOperatorKey } from './lib/crypto';
import { ensureSepolia, requestAccounts } from './lib/metamask';

function InnerApp() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const [mmAccount, setMmAccount] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  const [bastionAddress, setBastionAddress] = useState<string>('');
  const [bastionAddressInput, setBastionAddressInput] = useState<string>('');
  const [operatorPriv, setOperatorPriv] = useState<string>('');
  const [operatorAddr, setOperatorAddr] = useState<string>('');

  const [tokenInput, setTokenInput] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const mockTokenAddress = (import.meta.env.VITE_MOCK_TOKEN_ADDRESS as string | undefined) || '';
  

  const allowedDomain = (import.meta.env.VITE_ALLOWED_DOMAIN as string) || 'https://dashboard.zerodev.app';

  async function connectMetaMask() {
    try {
      await ensureSepolia();
      const accounts = await requestAccounts();
      setMmAccount(accounts?.[0] || '');
    } catch (e: any) {
      setStatus(`MetaMask error: ${e.message || e}`);
    }
  }

  async function handleGenerateAccount() {
    try {
      setStatus('Generating operator key...');
      const { privateKey, address } = generateOperatorKey();
      setOperatorPriv(privateKey);
      setOperatorAddr(address);

      if (!mmAccount) throw new Error('Connect MetaMask first');

      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      const [account] = await walletClient.getAddresses();
      const factoryAddress = getFactoryAddress();

      // Validate inputs
      let tokenAddr: `0x${string}`;
      try { tokenAddr = getAddress(tokenInput) as `0x${string}`; } catch { throw new Error('Invalid token address'); }
      const amt = parseUnits((amountInput || ''), 18);
      if (amt <= 0n) throw new Error('Amount must be greater than 0');

      // Build approval with operator as 20-byte EOA (abi.encodePacked(address))
      let approvalValue = {
        operator: encodePacked(['address'], [getAddress(address)]),
        token: tokenAddr,
        amount: amt,
        domain: keccak256(stringToBytes(allowedDomain)),
        salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
      } as const;

      // EIP-712 Typed Data
      const chainId = sepolia.id;
      const domain = {
        name: 'BastionFactory',
        version: '0.0.0-beta',
        chainId,
        verifyingContract: factoryAddress,
      } as const;
      const types = {
        Approval: [
          { name: 'operator', type: 'bytes' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'domain', type: 'bytes32' },
          { name: 'salt', type: 'bytes32' },
        ],
      } as const;

      

      setStatus('Requesting EIP-712 signature...');
      let v = 0, r: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000', s: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000';
      let sessionAddress: `0x${string}` = zeroAddress;
      for (let i = 0; i < 10; i++) {
        const signature = await walletClient.signTypedData({ account, domain, types, primaryType: 'Approval', message: approvalValue });
        // viem doesn't expose v/r/s directly; split manually
        // signature is 65-byte 0x...; last byte is v
        const sigBytes = signature as `0x${string}`;
        r = sigBytes.slice(0, 66) as `0x${string}`;
        s = (`0x${sigBytes.slice(66, 130)}`) as `0x${string}`;
        const vHex = sigBytes.slice(130, 132);
        v = parseInt(vHex, 16);
        if (v < 27) v += 27;

        // sanity checks: digest and recovered owner
        const localDigest = hashTypedData({ domain, types, primaryType: 'Approval', message: approvalValue });
        const onchainDigest = await publicClient.readContract({ address: factoryAddress, abi: BASTION_FACTORY_ABI, functionName: 'getDigest', args: [[approvalValue.operator, approvalValue.token, approvalValue.amount, approvalValue.domain, approvalValue.salt]] });
        if (localDigest.toLowerCase() !== (onchainDigest as string).toLowerCase()) throw new Error('Digest mismatch');
        const recovered = await recoverTypedDataAddress({ domain, types, primaryType: 'Approval', message: approvalValue, signature });
        if (recovered.toLowerCase() !== account.toLowerCase()) throw new Error('Recovered owner != connected account');
        sessionAddress = await publicClient.readContract({ address: factoryAddress, abi: BASTION_FACTORY_ABI, functionName: 'getBastionAddress', args: [BigInt(chainId), v, r, s] });
        if (sessionAddress !== zeroAddress) break;
        // mutate salt and retry
        approvalValue = {
          ...approvalValue,
          salt: keccak256(approvalValue.salt),
        } as const;
      }
      setBastionAddress(sessionAddress);

      // Approve ERC20 to Factory
      setStatus('Sending token approval to factory...');
      const { request: approveRequest } = await publicClient.simulateContract({
        account,
        address: approvalValue.token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [factoryAddress, approvalValue.amount],
      });
      const hashApprove = await walletClient.writeContract(approveRequest);
      await publicClient.waitForTransactionReceipt({ hash: hashApprove });

      // Call checkSig to initialize Bastion and set allowance
      setStatus('Finalizing session (checkSig)...');
      const { request: checkSigRequest } = await publicClient.simulateContract({
        account,
        address: factoryAddress,
        abi: BASTION_FACTORY_ABI,
        functionName: 'checkSig',
        args: [
          [approvalValue.operator, approvalValue.token, approvalValue.amount, approvalValue.domain, approvalValue.salt],
          BigInt(chainId), v, r, s,
        ],
      });
      const hash = await walletClient.writeContract(checkSigRequest);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus('Session created. Bastion ready.');
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message || e}`);
    }
  }

  async function handleChangeKey() {
    try {
      if (!bastionAddress) throw new Error('Generate or input a Bastion address first.');
      const { privateKey, address } = generateOperatorKey();
      setOperatorPriv(privateKey);
      setOperatorAddr(address);

      const publicClient = getPublicClient();
      const walletClient = getWalletClient();
      const [account] = await walletClient.getAddresses();
      setStatus('Calling changeOperator...');
      const txHash = await walletClient.writeContract({
        account,
        address: bastionAddress as `0x${string}`,
        abi: BASTION_ABI,
        functionName: 'changeOperator',
        args: [encodePacked(['address'], [getAddress(address)])],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setStatus('Operator changed.');
    } catch (e: any) {
      setStatus(`Error: ${e.message || e}`);
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '40px auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h2>Bastion Demo (Sepolia)</h2>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={connectMetaMask}>Connect MetaMask</button>
        <button onClick={authenticated ? logout : login}>{authenticated ? 'Logout Privy' : 'Login with Privy'}</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
        <div>MetaMask: {mmAccount || '-'}</div>
        <div>Privy: {authenticated ? user?.wallet?.address || 'authenticated' : '-'}</div>
      </div>

      <hr style={{ margin: '24px 0' }} />

      <h3>Generate account</h3>
      
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '160px 1fr' }}>
        <label>ERC20 Token</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="0xToken" style={{ flex: 1 }} />
          {mockTokenAddress && (
            <button onClick={() => setTokenInput(mockTokenAddress)} title="Use mock token address from env">Use MOCK</button>
          )}
        </div>
        <label>Allowance Amount</label>
        <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="e.g. 100" />
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={handleGenerateAccount}>Generate operator + create session</button>
        {mockTokenAddress && (
          <button style={{ marginLeft: 8 }} onClick={async () => {
            try {
              if (!operatorAddr) throw new Error('Generate operator first');
              const publicClient = getPublicClient();
              const walletClient = getWalletClient();
              const [account] = await walletClient.getAddresses();
              const { request } = await publicClient.simulateContract({
                account,
                address: mockTokenAddress as `0x${string}`,
                abi: MOCK_TOKEN_ABI,
                functionName: 'mint',
                args: [operatorAddr as `0x${string}`, 100n],
              });
              const hash = await walletClient.writeContract(request);
              await publicClient.waitForTransactionReceipt({ hash });
              setStatus('Minted 100 MOCK to operator');
            } catch (e: any) {
              setStatus(`Mint failed: ${e.message || e}`);
            }
          }}>Mint $MOCK</button>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
          <label>Bastion address</label>
          <input value={bastionAddressInput || bastionAddress} onChange={(e) => setBastionAddressInput(e.target.value)} placeholder="0xBastion" />
        </div>
        <div>Operator address: {operatorAddr || '-'}</div>
        <div>Operator private key: {operatorPriv || '-'}</div>
      </div>

      <hr style={{ margin: '24px 0' }} />
      <h3>Change key</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={async () => {
          if (bastionAddressInput) setBastionAddress(bastionAddressInput);
          await handleChangeKey();
        }}>Generate new operator key + changeOperator</button>
      </div>

      <div style={{ marginTop: 20, color: '#444' }}>{status}</div>
    </div>
  );
}

export default function App() {
  const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
  return (
    <PrivyProvider appId={privyAppId || 'demo-placeholder'}>
      <InnerApp />
    </PrivyProvider>
  );
}


