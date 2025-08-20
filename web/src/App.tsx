import React, { useEffect, useMemo, useState } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import {
  createWalletClient,
  custom,
  keccak256,
  toHex,
  stringToBytes,
  zeroAddress,
  parseUnits,
  getAddress,
  encodePacked,
  recoverTypedDataAddress,
  hashTypedData,
  encodeFunctionData,
  http,
  createPublicClient,
  pad,
  Authorization,
} from 'viem';
import { recoverAuthorizationAddress } from 'viem/utils';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  getPublicClient,
  getWalletClient,
  getFactoryAddress,
  ERC20_ABI,
  BASTION_FACTORY_ABI,
  BASTION_ABI,
  MOCK_TOKEN_ABI,
} from './lib/contracts';
import { generateOperatorKey } from './lib/crypto';
import { ensureSepolia, requestAccounts } from './lib/metamask';

/** Privy v2+ 임베디드 지갑에서 EIP-1193 provider를 가져오는 헬퍼 */
async function getPrivyEip1193Provider(opts: {
  ready: boolean;
  authenticated: boolean;
  wallets: ReturnType<typeof useWallets>['wallets'];
}) {
  const { ready, authenticated, wallets } = opts;
  if (!ready) throw new Error('Privy SDK not ready yet');
  if (!authenticated) throw new Error('Login with Privy first');

  // Privy v2+ 에서는 임베디드 지갑을 다르게 식별
  const embeddedWallet = wallets.find((w: any) => 
    w.walletClientType === 'privy' || 
    w.connectorType === 'embedded' ||
    w.type === 'privy'
  );

  if (!embeddedWallet) {
    throw new Error(
      'No Privy embedded wallet found. Make sure embeddedWallets.createOnLogin is enabled.'
    );
  }

  console.log('Found Privy wallet:', embeddedWallet);
  console.log('Available methods:', Object.getOwnPropertyNames(embeddedWallet));

  // Privy v2+ 에서 provider 가져오기
  let provider: any = null;
  
  if (typeof (embeddedWallet as any).getEthereumProvider === 'function') {
    provider = await (embeddedWallet as any).getEthereumProvider();
  } else if (typeof (embeddedWallet as any).getProvider === 'function') {
    provider = await (embeddedWallet as any).getProvider();
  } else if ((embeddedWallet as any).provider) {
    provider = (embeddedWallet as any).provider;
  }

  if (!provider) {
    throw new Error('Could not get EIP-1193 provider from Privy wallet');
  }

  console.log('Got Privy provider:', provider);
  return { provider, address: embeddedWallet.address as `0x${string}` };
}

function InnerApp() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const [mmAccount, setMmAccount] = useState<string>('');
  const [ambireAccount, setAmbireAccount] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [activeWallet, setActiveWallet] = useState<'metamask' | 'privy' | 'ambire'>('metamask');

  const [bastionAddress, setBastionAddress] = useState<string>('');
  const [bastionAddressInput, setBastionAddressInput] = useState<string>('');
  const [operatorPriv, setOperatorPriv] = useState<string>('');
  const [operatorAddr, setOperatorAddr] = useState<string>('');
  const [sessionBalance, setSessionBalance] = useState<string>('0');
  const [v, setV] = useState<number>(0);
  const [r, setR] = useState<`0x${string}`>('0x0000000000000000000000000000000000000000000000000000000000000000');
  const [s, setS] = useState<`0x${string}`>('0x0000000000000000000000000000000000000000000000000000000000000000');
  const [salt, setSalt] = useState<`0x${string}`>('0x0000000000000000000000000000000000000000000000000000000000000000');

  const [tokenInput, setTokenInput] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');

  const mockTokenAddress = (import.meta.env.VITE_MOCK_TOKEN_ADDRESS as string | undefined) || '';
  const allowedDomain = (import.meta.env.VITE_ALLOWED_DOMAIN as string) || 'https://dashboard.zerodev.app';

  // ✅ 활성 지갑별 주소 표시
  const activeAddress = useMemo(() => {
    try {
      if (activeWallet === 'metamask') {
        return mmAccount ? getAddress(mmAccount as `0x${string}`) : '-';
      } else if (activeWallet === 'ambire') {
        return ambireAccount ? getAddress(ambireAccount as `0x${string}`) : '-';
      } else if (activeWallet === 'privy') {
        // Privy v2+ 임베디드 지갑 찾기
        const embeddedWallet = wallets.find((w: any) => 
          w.walletClientType === 'privy' || 
          w.connectorType === 'embedded' ||
          w.type === 'privy'
        );
        return authenticated && embeddedWallet?.address ? getAddress(embeddedWallet.address as `0x${string}`) : '-';
      }
      return '-';
    } catch {
      return '-';
    }
  }, [activeWallet, mmAccount, ambireAccount, wallets, authenticated]);

  async function connectMetaMask() {
    try {
      await ensureSepolia();
      const accounts = await requestAccounts();
      setMmAccount(accounts?.[0] || '');
      setStatus('MetaMask connected.');
    } catch (e: any) {
      setStatus(`MetaMask error: ${e.message || e}`);
    }
  }

  async function connectAmbire() {
    try {
      const ambire = (window as any).ambire;
      if (!ambire) throw new Error('Ambire Wallet not found');
      
      const accounts = await ambire.request({ method: 'eth_requestAccounts' });
      setAmbireAccount(accounts?.[0] || '');
      setStatus('Ambire Wallet connected.');
    } catch (e: any) {
      setStatus(`Ambire error: ${e.message || e}`);
    }
  }

  async function switchToSepolia() {
    try {
      const provider = activeWallet === 'metamask' ? (window as any).ethereum :
                      activeWallet === 'ambire' ? (window as any).ambire :
                      null;
      
      if (!provider) {
        setStatus('Please connect a wallet first');
        return;
      }

      const sepoliaParams = {
        chainId: '0xaa36a7', // 11155111
        chainName: 'Sepolia',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: [import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID'],
        blockExplorerUrls: ['https://sepolia.etherscan.io']
      };

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: sepoliaParams.chainId }]
        });
        setStatus('Switched to Sepolia network');
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to the wallet
        if (switchError.code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [sepoliaParams]
          });
          setStatus('Added and switched to Sepolia network');
        } else {
          throw switchError;
        }
      }
    } catch (e: any) {
      setStatus(`Network switch error: ${e.message || e}`);
    }
  }

  async function updateSessionBalance() {
    if (!operatorAddr) return;
    try {
      const publicClient = getPublicClient();
      const balance = await publicClient.getBalance({
        address: operatorAddr as `0x${string}`,
      });
      setSessionBalance((Number(balance) / 1e18).toFixed(6));
    } catch (e) {
      console.error('Failed to get session balance:', e);
      setSessionBalance('Error');
    }
  }

  async function getActiveWalletClientChecked() {
    const publicClient = getPublicClient();

    if (activeWallet === 'metamask') {
      await ensureSepolia();
      const accounts = await requestAccounts();
      const eth = (window as any).ethereum;
      if (!eth) throw new Error('MetaMask provider not found');
      const walletClient = createWalletClient({ chain: sepolia, transport: custom(eth) });
      const account = (accounts && accounts[0]) as `0x${string}`;
      return { walletClient, account, publicClient } as const;
    }

    if (activeWallet === 'ambire') {
      const ambire = (window as any).ambire;
      if (!ambire) throw new Error('Ambire Wallet provider not found');
      const accounts = await ambire.request({ method: 'eth_requestAccounts' });
      const walletClient = createWalletClient({ chain: sepolia, transport: custom(ambire) });
      const account = (accounts && accounts[0]) as `0x${string}`;
      return { walletClient, account, publicClient } as const;
    }

    // ---- Privy (임베디드 전용) ----
    if (!ready) throw new Error('Privy SDK not ready yet');
    if (!authenticated) throw new Error('Login with Privy first');

    const { provider, address } = await getPrivyEip1193Provider({ ready, authenticated, wallets });
    const walletClient = createWalletClient({ chain: sepolia, transport: custom(provider) });
    const account = address;
    return { walletClient, account, publicClient } as const;
  }

  async function handleGenerateOperator() {
    try {
      setStatus('Generating operator key...');
      const { privateKey, address } = generateOperatorKey();
      setOperatorPriv(privateKey);
      setOperatorAddr(address);
      
      // Update session balance
      await updateSessionBalance();
      setStatus('Operator key generated. Check session balance before proceeding.');
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message || e}`);
    }
  }

  async function handleCreateSession() {
    try {
      if (!operatorPriv || !operatorAddr) throw new Error('Generate operator key first');
      if (activeWallet === 'metamask' && !mmAccount) throw new Error('Connect MetaMask first');
      if (activeWallet === 'ambire' && !ambireAccount) throw new Error('Connect Ambire Wallet first');

      const { walletClient, account, publicClient } = await getActiveWalletClientChecked();
      const factoryAddress = getFactoryAddress();

      // Validate inputs
      let tokenAddr: `0x${string}`;
      try {
        tokenAddr = getAddress(tokenInput) as `0x${string}`;
      } catch {
        throw new Error('Invalid token address');
      }
      const amt = parseUnits(amountInput || '', 18);
      if (amt <= 0n) throw new Error('Amount must be greater than 0');

      const saltTemp = toHex(crypto.getRandomValues(new Uint8Array(32)));
      setSalt(saltTemp);

      // Build approval with operator as 32-byte padded address
      let approvalValue = {
        operator: encodePacked(['address'], [getAddress(operatorAddr)]),
        token: tokenAddr,
        amount: amt,
        domain: keccak256(stringToBytes(allowedDomain)),
        salt: saltTemp,
      } as const;

      // EIP-712 Typed Data
      const chainId = await walletClient.getChainId();
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
      let sessionAddress: `0x${string}` = zeroAddress;

      // Get signature once
      const signature = await walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType: 'Approval',
        message: approvalValue,
      });

      // split v/r/s
      const sigBytes = signature as `0x${string}`;
      const rValue = sigBytes.slice(0, 66) as `0x${string}`;
      const sValue = (`0x${sigBytes.slice(66, 130)}`) as `0x${string}`;
      const vHex = sigBytes.slice(130, 132);
      let vValue = parseInt(vHex, 16);
      if (vValue < 27) vValue += 27;

      // Store signature values in state
      setR(rValue);
      setS(sValue);
      setV(vValue);

      // sanity checks
      const localDigest = hashTypedData({ domain, types, primaryType: 'Approval', message: approvalValue });
      const onchainDigest = await publicClient.readContract({
        address: factoryAddress,
        abi: BASTION_FACTORY_ABI,
        functionName: 'getDigest',
        args: [approvalValue],
      });
      
      if (localDigest.toLowerCase() !== (onchainDigest as string).toLowerCase()) throw new Error('Digest mismatch');

      const recovered = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: 'Approval',
        message: approvalValue,
        signature,
      });
      if (recovered.toLowerCase() !== account.toLowerCase()) throw new Error('Recovered owner != connected account');

      sessionAddress = await publicClient.readContract({
        address: factoryAddress,
        abi: BASTION_FACTORY_ABI,
        functionName: 'getBastionAddress',
        args: [BigInt(chainId), vValue, rValue, sValue],
      });

      setBastionAddress(sessionAddress);

      // Verify EIP-7702 authorization signature immediately after EIP-712
      const implAddress = (await publicClient.readContract({
        address: factoryAddress,
        abi: BASTION_FACTORY_ABI,
        functionName: 'impl',
      })) as `0x${string}`;

      const authorization: Authorization = {
        address: implAddress,
        chainId: sepolia.id,
        nonce: 0,
        yParity: vValue - 27,
        r: rValue,
        s: sValue,
      };
      
      console.log('EIP-7702 Authorization Check:', {
        authorization,
        sessionAddress,
        implAddress,
      });

            // We need bastion address to sign EIP-7702 authorization, not use approval signature
      console.log('🚨 PROBLEM: We need bastion address to sign authorization, but bastion is derived from owner signature');
      console.log('This creates a chicken-and-egg problem. Let me check the test again...');
      
      // The test shows that the SAME signature is used for both approval AND authorization
      // This means getBastionAddress actually derives the bastion from the authorization signature
      console.log('Testing if approval signature recovers to bastion address for authorization...');
      
      try {
        const recoveredAddress = await recoverAuthorizationAddress({
          authorization,
          signature: encodePacked(['bytes32', 'bytes32', 'uint8'], [rValue, sValue, vValue]),
        });
        
        console.log('Authorization recovery test:', {
          recoveredAddress,
          bastionAddress: sessionAddress,
          matches: recoveredAddress.toLowerCase() === sessionAddress.toLowerCase()
        });
        
        if (recoveredAddress.toLowerCase() === sessionAddress.toLowerCase()) {
          console.log('✅ Approval signature correctly recovers to bastion address for authorization');
        } else {
          console.log('❌ Signature mismatch - this explains why authority != bastion address');
          console.log('The getBastionAddress function might be using a different derivation method');
        }
        
      } catch (authValidationErr) {
        console.error('Authorization validation failed:', authValidationErr);
        throw authValidationErr;
      }

      // Approve ERC20 to Factory (skip if already sufficient)
      const currentAllowance = (await publicClient.readContract({
        address: approvalValue.token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account, factoryAddress],
      })) as bigint;

      if (currentAllowance >= approvalValue.amount) {
        setStatus('Existing allowance is sufficient. Skipping approve.');
      } else {
        setStatus('Sending token approval to factory...');
        try {
          const { request: approveRequest } = await publicClient.simulateContract({
            account,
            address: approvalValue.token,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [factoryAddress, approvalValue.amount],
          });
          const hashApprove = await walletClient.writeContract(approveRequest);
          await publicClient.waitForTransactionReceipt({ hash: hashApprove });
        } catch {
          // Fallback for non-standard tokens requiring zero-first
          const { request: zeroReq } = await publicClient.simulateContract({
            account,
            address: approvalValue.token,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [factoryAddress, 0n],
          });
          const zeroHash = await walletClient.writeContract(zeroReq);
          await publicClient.waitForTransactionReceipt({ hash: zeroHash });

          const { request: approveRequest2 } = await publicClient.simulateContract({
            account,
            address: approvalValue.token,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [factoryAddress, approvalValue.amount],
          });
          const hashApprove2 = await walletClient.writeContract(approveRequest2);
          await publicClient.waitForTransactionReceipt({ hash: hashApprove2 });
        }
      }


      // 7702: send transaction with authorization list (if wallet supports)
      setStatus('Finalizing session (checkSig)...');

            setStatus('EIP-712 signature completed. Ready for checkSig call.');
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message || e}`);
    }
  }

  async function handleCallCheckSig() {
    try {
      if (!operatorPriv || !operatorAddr) throw new Error('Generate operator key first');
      if (!bastionAddress) throw new Error('Create session first');

      // Check session balance
      await updateSessionBalance();
      const balance = parseFloat(sessionBalance);
      if (balance < 0.001) {
        setStatus(`Session account balance too low: ${sessionBalance} ETH. Please fund the session account first.`);
        return;
      }

      setStatus('Calling checkSig from session account...');
      
      // Create session account from operator private key
      const sessionAccount = privateKeyToAccount(operatorPriv as `0x${string}`);
      const sessionWalletClient = createWalletClient({
        account: sessionAccount,
        chain: sepolia,
        transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL as string),
      });

      const publicClient = getPublicClient();
      const factoryAddress = getFactoryAddress();

      // Get impl address for delegation
      const implAddress = (await publicClient.readContract({
        address: factoryAddress,
        abi: BASTION_FACTORY_ABI,
        functionName: 'impl',
      })) as `0x${string}`;

      // Get the stored signature data from previous step
      const data = encodeFunctionData({
        abi: BASTION_FACTORY_ABI,
        functionName: 'checkSig',
        args: [
          {
            operator: encodePacked(['address'], [getAddress(operatorAddr)]),
            token: tokenInput as `0x${string}`,
            amount: parseUnits(amountInput || '', 18),
            domain: keccak256(stringToBytes((import.meta.env.VITE_ALLOWED_DOMAIN as string) || 'https://dashboard.zerodev.app')),
            salt: salt,
          },
          BigInt(sepolia.id),
          v, // v
          r, // r
          s, // s
        ],
      });



      const txHash = await sessionWalletClient.sendTransaction({
        account: sessionAccount,
        to: factoryAddress,
        data,
        value: 0n,
        authorizationList: [
          {
            address: implAddress, // Delegate bastion address to impl
            chainId: BigInt(sepolia.id),
            nonce: 0n,
            yParity: BigInt(v - 27),
            r: r,
            s: s,
          }
        ]
      } as any);

      console.log('CheckSig transaction sent:', txHash);
      
      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      console.log('CheckSig receipt:', receipt);
      setStatus('CheckSig completed. Session account activated.');
      await updateSessionBalance(); // Update balance after transaction
    } catch (e: any) {
      console.error(e);
      setStatus(`CheckSig error: ${e.message || e}`);
    }
  }

  async function handleChangeKey() {
    try {
      if (!bastionAddress && !bastionAddressInput) {
        throw new Error('Generate or input a Bastion address first.');
      }
      if (bastionAddressInput) setBastionAddress(bastionAddressInput);

      const { privateKey, address } = generateOperatorKey();
      setOperatorPriv(privateKey);
      setOperatorAddr(address);

      const { walletClient, account, publicClient } = await getActiveWalletClientChecked();
      setStatus('Calling changeOperator...');
      const txHash = await walletClient.writeContract({
        account,
        address: (bastionAddressInput || bastionAddress) as `0x${string}`,
        abi: BASTION_ABI,
        functionName: 'changeOperator',
        args: [encodePacked(['address'], [getAddress(address)])],
        chain: sepolia,
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

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>Mode:</span>
        <button
          onClick={() => setActiveWallet('metamask')}
          style={{ background: activeWallet === 'metamask' ? '#eee' : 'transparent' }}
        >
          MetaMask
        </button>
        <button
          onClick={() => setActiveWallet('ambire')}
          style={{ background: activeWallet === 'ambire' ? '#eee' : 'transparent' }}
        >
          Ambire
        </button>
        <button
          onClick={() => setActiveWallet('privy')}
          style={{ background: activeWallet === 'privy' ? '#eee' : 'transparent' }}
        >
          Privy
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button onClick={connectMetaMask} disabled={activeWallet !== 'metamask'}>
          Connect MetaMask
        </button>
        <button onClick={connectAmbire} disabled={activeWallet !== 'ambire'}>
          Connect Ambire
        </button>
        <button onClick={authenticated ? logout : login} disabled={activeWallet !== 'privy'}>
          {authenticated ? 'Logout Privy' : 'Login Privy'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button 
          onClick={switchToSepolia}
          disabled={activeWallet === 'privy'}
          style={{ backgroundColor: '#f0f8ff', border: '1px solid #4169e1' }}
        >
          🔗 Switch to Sepolia
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
        <div>Mode: {activeWallet}</div>
        <div>Active account: {activeAddress}</div>
        <div>
          Factory:{' '}
          {(() => {
            try {
              return getAddress(getFactoryAddress());
            } catch {
              return '-';
            }
          })()}
        </div>
        {activeWallet === 'privy' && (
          <div>
            Privy ready/auth: {String(ready)}/{String(authenticated)} | wallets: {wallets.length}
          </div>
        )}
        {/* 임베디드/외부 지갑 상태 디버깅 */}
        {activeWallet === 'privy' && wallets.length > 0 && (
          <details style={{ marginTop: 4 }}>
            <summary>Privy wallets debug</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
              {JSON.stringify(
                wallets.map((w: any) => ({
                  address: w?.address,
                  type: w?.type,
                  walletClientType: w?.walletClientType,
                })),
                null,
                2
              )}
            </pre>
          </details>
        )}
      </div>

      <hr style={{ margin: '24px 0' }} />

      <h3>Generate account</h3>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '160px 1fr' }}>
        <label>ERC20 Token</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="0xToken" style={{ flex: 1 }} />
          {mockTokenAddress && (
            <button onClick={() => setTokenInput(mockTokenAddress)} title="Use mock token address from env">
              Use MOCK
            </button>
          )}
        </div>

        <label>Allowance Amount</label>
        <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="e.g. 100" />
      </div>

      <div style={{ marginTop: 8 }}>
        <button
          onClick={handleGenerateOperator}
        >
          1. Generate Operator Key
        </button>
        <button
          onClick={handleCreateSession}
          disabled={!operatorPriv || (activeWallet === 'privy' && (!ready || !authenticated || wallets.length === 0))}
          style={{ marginLeft: 8 }}
        >
          2. Create Session (EIP-712)
        </button>
        <button
          onClick={handleCallCheckSig}
          disabled={!bastionAddress || !operatorPriv}
          style={{ marginLeft: 8 }}
        >
          3. Call CheckSig
        </button>

        {mockTokenAddress && (
          <button
            style={{ marginLeft: 8 }}
            onClick={async () => {
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
            }}
          >
            Mint $MOCK
          </button>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
          <label>Bastion address</label>
          <input
            value={bastionAddressInput || bastionAddress}
            onChange={(e) => setBastionAddressInput(e.target.value)}
            placeholder="0xBastion"
          />
        </div>
        <div>
          Operator address:{' '}
          {(() => {
            try {
              return operatorAddr ? getAddress(operatorAddr as `0x${string}`) : '-';
            } catch {
              return operatorAddr || '-';
            }
          })()}
        </div>
        <div>Operator private key: {operatorPriv || '-'}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>Session balance: {sessionBalance} ETH</span>
          <button 
            onClick={updateSessionBalance}
            disabled={!operatorAddr}
            style={{ fontSize: 12, padding: '2px 6px' }}
          >
            Refresh
          </button>
        </div>
      </div>

      <hr style={{ margin: '24px 0' }} />
      <h3>Change key</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={async () => {
            await handleChangeKey();
          }}
          disabled={activeWallet === 'privy' && (!ready || !authenticated || wallets.length === 0)}
        >
          Generate new operator key + changeOperator
        </button>
      </div>

      <div style={{ marginTop: 20, color: '#444' }}>{status}</div>
    </div>
  );
}

export default function App() {
  const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
  if (!privyAppId) throw new Error('VITE_PRIVY_APP_ID is required');

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        defaultChain: sepolia,
        loginMethods: ['email', 'google', 'sms', 'wallet'],
        // ✅ Privy v2+ 임베디드 지갑 설정
        embeddedWallets: { 
          createOnLogin: 'all-users',
          requireUserPasswordOnCreate: false,
        },
        // Privy v2+ 설정
        appearance: {
          theme: 'light',
        },
      }}
    >
      <InnerApp />
    </PrivyProvider>
  );
}