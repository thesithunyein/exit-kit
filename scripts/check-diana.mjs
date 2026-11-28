import { writeFile } from 'node:fs/promises';
import { bytesToHex, decodeWireBytes } from '@qorechain/rdk';
import { DIANA_REST, chainClient, exportRecovery, proofRoot, verifyRecovery } from '../src/recovery.js';

// A historical payout published in Vigil's evidence ledger, row 106.
const knownPayout = '258430D7FA0F4DB3CA8D2ABFF50C3247B1FF66058D02AFB293775ADDBD51A21C';
const hash = process.argv[2] || knownPayout;
if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error('Enter a valid Diana transaction hash.');
const client = chainClient();
const tx = await client.rest.getTx(hash);
if (tx.tx_response?.code !== 0) throw new Error('Diana has no successful transaction at this hash.');
const claim = tx.tx?.body?.messages?.find(message => message['@type'] === '/qorechain.rdk.v1.MsgExecuteWithdrawal');
if (!claim) throw new Error('This transaction contains no native RDK withdrawal.');
const file = await exportRecovery(client, DIANA_REST, {
  rollupId: claim.rollup_id, batchIndex: claim.batch_index, withdrawalIndex: claim.withdrawal_index,
  recipient: claim.recipient, amount: claim.amount, proof: claim.proof.map(item => bytesToHex(decodeWireBytes(item))),
});
const status = await verifyRecovery(client, DIANA_REST, file);
if (status.state !== 'paid' || status.txHash.toUpperCase() !== hash.toUpperCase()) throw new Error('Payout did not match the chain index.');
console.log(JSON.stringify({
  state: status.state, signedReceipt: status.receiptVerified, network: file.chainId, rollup: file.rollupId,
  batch: file.batchIndex, withdrawal: file.withdrawalIndex, recipient: file.recipient, amount: file.amount + 'uqor',
  withdrawalsRoot: proofRoot(file), anchorHeight: file.receipt.mainChainHeight, payout: status.txHash,
}, null, 2));
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(file, null, 2) + '\n', { flag: 'wx' });
