export async function requestAccounts() {
  const anyWindow = window as any;
  if (!anyWindow.ethereum) throw new Error('MetaMask not found');
  const accounts: string[] = await anyWindow.ethereum.request({ method: 'eth_requestAccounts' });
  return accounts;
}

export async function ensureSepolia() {
  const anyWindow = window as any;
  const sepoliaParams = {
    chainId: '0xaa36a7',
    chainName: 'Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: [import.meta.env.VITE_SEPOLIA_RPC_URL],
    blockExplorerUrls: ['https://sepolia.etherscan.io']
  };
  try {
    await anyWindow.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: sepoliaParams.chainId }] });
  } catch (e: any) {
    if (e.code === 4902) {
      await anyWindow.ethereum.request({ method: 'wallet_addEthereumChain', params: [sepoliaParams] });
    } else {
      throw e;
    }
  }
}


