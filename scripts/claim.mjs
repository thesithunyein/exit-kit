import { readFile } from 'node:fs/promises';
import { hexToBytes } from '@qorechain/rdk';
import { DIANA_REST, chainClient, formatAmount, parseRecovery, verifyRecovery } from '../src/recovery.js';
import { committed, connectSigner, mnemonicFor } from './signer.mjs';

try {
  const [path, ...flags] = process.argv.slice(2);
  if (!path || flags.some(flag => flag !== '--broadcast')) throw new Error('Usage: node scripts/claim.mjs <recovery.json> [--broadcast]');
  const file = parseRecovery(await readFile(path, 'utf8'));
  const client = chainClient();
  const verified = await verifyRecovery(client, DIANA_REST, file);
  console.log(verified.state + ' · ' + formatAmount(file.amount) + ' · ' + file.recipient);
  if (verified.txHash) console.log('https://explore.qore.network/tx/' + verified.txHash);
  if (flags.includes('--broadcast') && verified.state === 'ready') {
    const signer = await connectSigner(client, await mnemonicFor(process.env.QORE_SIGNER_FILE));
    const tx = await signer.executeWithdrawal({
      rollupId: file.rollupId, batchIndex: BigInt(file.batchIndex), withdrawalIndex: BigInt(file.withdrawalIndex),
      recipient: file.recipient, amount: BigInt(file.amount), denom: file.denom, proof: file.proof.map(hexToBytes),
    });
    console.log('https://explore.qore.network/tx/' + committed(tx));
  } else if (verified.state !== 'ready' && verified.state !== 'paid') process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
