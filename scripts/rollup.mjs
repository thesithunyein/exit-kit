import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  EMPTY_INBOX_ACC, QledgerLedger, bytesToHex, decodeWireBytes, encodeQledgerTx,
  executeQledger, fetchQledgerEntries, inboxRangeHash, isCanonicalQorAddress, isRestNotFound,
  planQledgerBatch, qledgerAccumulate, qledgerKeypairFromSeed, qledgerWithdrawalProof,
  signQledgerTx,
} from '@qorechain/rdk';
import { CHAIN_ID, DIANA_REST, ROLLUP_ID, chainClient, exportRecovery } from '../src/recovery.js';
import { committed, connectSigner, mnemonicFor } from './signer.mjs';

const client = chainClient();
const operation = process.argv[2];
const rollupId = process.env.EXIT_KIT_ROLLUP || 'exit-kit-diana';
const environment = { chainId: CHAIN_ID, rollupId };
const purpose = 'exit-kit-operator-note';

async function replay() {
  const ledger = new QledgerLedger();
  const batches = await client.rest.listBatches(rollupId);
  let sequence = 0n;
  let acc = EMPTY_INBOX_ACC;
  const executed = new Map();
  for (const batch of batches) {
    const end = BigInt(batch.inboxEnd);
    if (BigInt(batch.inboxStart) !== sequence || end <= sequence) throw new Error('Chain inbox ranges are incomplete.');
    const entries = await fetchQledgerEntries(client.rest, { ...environment, from: sequence, to: end, accFrom: acc });
    const nextAcc = qledgerAccumulate({ ...environment, from: sequence, accFrom: acc, entries });
    const dataHash = inboxRangeHash({ ...environment, from: sequence, to: end, accFrom: acc, accTo: nextAcc });
    const result = executeQledger(environment, ledger, entries);
    if (bytesToHex(dataHash) !== bytesToHex(decodeWireBytes(batch.dataHash)) ||
        bytesToHex(result.stateRoot) !== bytesToHex(decodeWireBytes(batch.stateRoot)) ||
        bytesToHex(result.withdrawalsRoot) !== (batch.withdrawalsRoot ? bytesToHex(decodeWireBytes(batch.withdrawalsRoot)) : '')) {
      throw new Error('Published roots differ from independent replay at batch ' + batch.batchIndex);
    }
    executed.set(batch.batchIndex, result.withdrawals);
    sequence = end;
    acc = nextAcc;
  }
  return { ledger, batches, executed };
}

async function lookupRollup() {
  try { return await client.rest.getRollup(rollupId); }
  catch (error) { if (isRestNotFound(error)) return null; throw error; }
}

function positiveAmount(value, label) {
  if (!/^[1-9][0-9]{0,17}$/.test(value || '')) throw new Error(label + ' must be a positive amount in uQOR.');
  return BigInt(value);
}

async function run() {
  if (!ROLLUP_ID.test(rollupId)) throw new Error('EXIT_KIT_ROLLUP must be a valid Diana rollup ID.');
  if (operation === 'watch') {
    const rollup = await lookupRollup();
    if (rollup?.executionVm !== 'qledger-v1') throw new Error('The configured Diana rollup has not been provisioned.');
    const { batches } = await replay();
    const { buildSettlementReceipt, verifySettlementReceipt } = await import('@qorechain/rdk');
    const statuses = [];
    for (const batch of batches) {
      const receipt = await buildSettlementReceipt(client, rollupId, batch.batchIndex);
      if (!(await verifySettlementReceipt(receipt, { client })).valid) throw new Error('Unverifiable anchor on batch ' + batch.batchIndex);
      statuses.push({ batch: batch.batchIndex, status: batch.status, signedReceipt: true });
    }
    const inbox = await client.rest.getInbox(rollupId);
    console.log(JSON.stringify({ rollupId, batches: statuses, inboxHead: inbox.headSequence,
      consumedThrough: inbox.consumedSequence, checkedAt: new Date().toISOString() }, null, 2));
    return;
  }
  if (operation === 'export') {
    const [batchText, claimText, filePath] = process.argv.slice(3);
    if (!/^\d+$/.test(batchText || '') || !/^\d+$/.test(claimText || '') || !filePath) {
      throw new Error('Usage: node scripts/rollup.mjs export <batch-index> <withdrawal-index> <output.recovery.json>');
    }
    const { executed } = await replay();
    const withdrawals = executed.get(Number(batchText));
    const position = withdrawals?.findIndex(item => item.index === BigInt(claimText)) ?? -1;
    if (position < 0) throw new Error('Withdrawal does not appear in the independently replayed batch.');
    const entry = withdrawals[position];
    const proof = qledgerWithdrawalProof(CHAIN_ID, rollupId, withdrawals, position).map(bytesToHex);
    const file = await exportRecovery(client, DIANA_REST, { rollupId, batchIndex: String(Number(batchText)),
      withdrawalIndex: String(entry.index), recipient: entry.recipient, amount: String(entry.amount), proof });
    await writeFile(filePath, JSON.stringify(file, null, 2) + '\n', { flag: 'wx' });
    console.log('Recovery file created for batch ' + file.batchIndex + ', withdrawal ' + file.withdrawalIndex);
    return;
  }
  if (operation === 'seal-note') {
    const [recipient, input, output] = process.argv.slice(3);
    if (!isCanonicalQorAddress(recipient || '') || !input || !output) throw new Error('Usage: node scripts/rollup.mjs seal-note <recipient> <input-file> <output-file>');
    const { envelopeToText, seal } = await import('@qorechain/qoreseal');
    const { fetchMlkemPublicKey } = await import('@qorechain/qoreseal/network');
    const mlkemPublicKey = await fetchMlkemPublicKey({ address: recipient, rest: DIANA_REST });
    const plaintext = await readFile(input);
    const envelope = seal({ chainId: CHAIN_ID, purpose, mode: 'mlkem', recipients: [{ mlkemPublicKey }],
      plaintext, aad: new TextEncoder().encode(rollupId) });
    await writeFile(output, envelopeToText(envelope) + '\n', { flag: 'wx' });
    return;
  }
  const mnemonic = await mnemonicFor(process.env.QORE_SIGNER_FILE);
  if (operation === 'open-note') {
    const [input, output] = process.argv.slice(3);
    if (!input || !output) throw new Error('Usage: node scripts/rollup.mjs open-note <input-file> <output-file>');
    const { deriveSealKeys, envelopeFromText, open } = await import('@qorechain/qoreseal');
    const envelope = envelopeFromText((await readFile(input, 'utf8')).trim());
    const plaintext = open({ chainId: CHAIN_ID, purpose, envelope, keys: deriveSealKeys({ mnemonic }),
      aad: new TextEncoder().encode(rollupId) });
    await writeFile(output, plaintext, { flag: 'wx', mode: 0o600 });
    return;
  }
  if (!['create', 'bond', 'deposit', 'request-withdrawal', 'batch', 'register-kem'].includes(operation)) {
    throw new Error('Use create, bond, deposit, request-withdrawal, batch, export, watch, register-kem, seal-note, or open-note.');
  }
  const tx = await connectSigner(client, mnemonic);
  const keys = qledgerKeypairFromSeed(createHash('sha256').update('exit-kit-diana-qledger\0' + mnemonic).digest());
  let response;
  if (operation === 'create') {
    if (await lookupRollup()) throw new Error('This rollup already exists.');
    const params = await client.params();
    response = await tx.createRollup({ rollupId, profile: 'nft', vmType: 'cosmwasm',
      stakeAmount: params.minStakeForRollup, executionVm: 'qledger-v1', sequencing: 'based' });
  } else {
    if (operation !== 'register-kem' && (await lookupRollup())?.creator !== tx.address) {
      throw new Error('This operator command requires the configured rollup’s creator account.');
    }
    if (operation === 'bond') {
      const params = await client.params();
      const current = await client.rest.getSubmitterBond(rollupId, tx.address);
      const shortage = BigInt(params.minSubmitterBond) - BigInt(current.amount);
      if (shortage <= 0n) { console.log('Operator bond already covers the minimum.'); return; }
      response = await tx.bondRollupSubmitter({ rollupId, amount: shortage });
    } else if (operation === 'register-kem') {
      const { deriveSealKeys } = await import('@qorechain/qoreseal');
      response = await tx.registerKemKey({ publicKey: deriveSealKeys({ mnemonic }).mlkemPublicKey });
    } else if (operation === 'deposit') {
      response = await tx.depositToRollup({ rollupId, account: keys.accountId, amount: positiveAmount(process.argv[3], 'Deposit') });
    } else if (operation === 'request-withdrawal') {
      const recipient = process.argv[4] || tx.address;
      if (!isCanonicalQorAddress(recipient)) throw new Error('Provide a valid Diana recipient.');
      const { ledger } = await replay();
      const amount = positiveAmount(process.argv[3], 'Withdrawal');
      const account = ledger.get(keys.accountId);
      if (account.balance < amount) throw new Error('The settled L2 balance does not cover this withdrawal.');
      const withdrawal = signQledgerTx({ ...environment, ...keys, recipient, amount, nonce: account.nonce });
      response = await tx.postRollupData({ rollupId, data: encodeQledgerTx(withdrawal) });
    } else {
      const { ledger } = await replay();
      const plan = await planQledgerBatch(client.rest, { ...environment, submitter: tx.address, ledger });
      response = await tx.submitBatch(plan.input, { anchor: 'require' });
    }
  }
  console.log('https://explore.qore.network/tx/' + committed(response));
}

try { await run(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
