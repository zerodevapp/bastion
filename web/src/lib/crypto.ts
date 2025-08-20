import { generatePrivateKey } from 'viem/accounts';
import { privateKeyToAccount } from 'viem/accounts';

export function generateOperatorKey() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    address: account.address,
  } as const;
}



