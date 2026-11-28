import { readFile } from 'node:fs/promises';
import { resolvePqcKeypair, signerFromEnv } from '@qorechain/rdk';

export async function mnemonicFor(path) {
  const mnemonic = path ? JSON.parse(await readFile(path, 'utf8')).mnemonic : process.env.QORE_MNEMONIC;
  if (typeof mnemonic !== 'string' || !mnemonic.trim()) throw new Error('Provide a Diana-only signer through QORE_SIGNER_FILE or QORE_MNEMONIC.');
  return mnemonic.trim();
}

export async function connectSigner(client, mnemonic) {
  const signer = await signerFromEnv({ QORE_MNEMONIC: mnemonic });
  const [account] = await signer.getAccounts();
  const key = await resolvePqcKeypair(client, account.address, mnemonic);
  return client.connectTx(signer, { pqcKeypair: key.keypair, includePqcPublicKey: key.includePqcPublicKey,
    signBytesVersion: 'auto', gasPrice: '0.15uqor', address: account.address });
}

export function committed(result) {
  if (result.code !== 0) throw new Error('Diana rejected the transaction (' + result.code + '): ' + result.rawLog);
  return result.transactionHash;
}
