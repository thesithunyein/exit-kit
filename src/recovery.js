import {
  buildSettlementReceipt, bytesToHex, createRdkClient, createRdkRegistry, decodeWireBytes,
  executeWithdrawalMsg, hexToBytes, isCanonicalQorAddress, isRestNotFound,
  qledgerWithdrawalLeaf, qorehash, receiptSchemaError, verifySettlementReceipt,
} from '@qorechain/rdk';

export const CHAIN_ID = 'qorechain-diana';
export const DIANA_REST = 'https://api-testnet.qore.host';
export const DIANA_RPC = 'https://rpc-testnet.qore.host';
export const FILE_LIMIT = 64 * 1024;
export const ROLLUP_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const HASH = /^[a-f0-9]{64}$/i;
const UINT64 = (1n << 64n) - 1n;
const INT64 = (1n << 63n) - 1n;

export class RecoveryError extends Error {}

function integer(value, label, max) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > max) {
    throw new RecoveryError(label + ' is outside the supported range.');
  }
  return value;
}

export function claimFromFields(input) {
  if (!input || typeof input.rollupId !== 'string' || !ROLLUP_ID.test(input.rollupId)) {
    throw new RecoveryError('Enter a valid rollup ID.');
  }
  if (typeof input.recipient !== 'string' || !isCanonicalQorAddress(input.recipient)) {
    throw new RecoveryError('The recipient must be a valid QoreChain address.');
  }
  const batchIndex = integer(input.batchIndex, 'Batch index', BigInt(Number.MAX_SAFE_INTEGER));
  const withdrawalIndex = integer(input.withdrawalIndex, 'Withdrawal index', UINT64);
  const amount = integer(input.amount, 'Withdrawal amount', INT64);
  if (amount === '0') throw new RecoveryError('The withdrawal amount must be greater than zero.');
  if (!Array.isArray(input.proof) || input.proof.length > 64 ||
      input.proof.some(hash => typeof hash !== 'string' || !HASH.test(hash))) {
    throw new RecoveryError('Each Merkle sibling must be a 64-character hexadecimal hash.');
  }
  return { rollupId: input.rollupId, batchIndex, withdrawalIndex, recipient: input.recipient,
    denom: 'uqor', amount, proof: input.proof.map(hash => hash.toLowerCase()) };
}

export function parseRecovery(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > FILE_LIMIT) {
    throw new RecoveryError('Choose a recovery file smaller than 64 KB.');
  }
  let input;
  try { input = JSON.parse(text); }
  catch { throw new RecoveryError('This file is not valid JSON.'); }
  if (input?.format !== 'exit-kit-recovery' || input.version !== 1 || input.denom !== 'uqor') {
    throw new RecoveryError('Exit Kit could not recognize this recovery file version.');
  }
  if (input.chainId !== CHAIN_ID) throw new RecoveryError('This file is for another network.');
  const claim = claimFromFields(input);
  const receipt = input.receipt;
  if (!receipt || receipt.version !== 2 || receipt.chainId !== CHAIN_ID ||
      receipt.rollupId !== claim.rollupId || receipt.batchIndex !== Number(claim.batchIndex) ||
      receiptSchemaError(receipt)) {
    throw new RecoveryError('The signed receipt does not match the file’s network, rollup, or batch.');
  }
  return { format: input.format, version: 1, chainId: CHAIN_ID, ...claim, receipt };
}

export function proofRoot(claim) {
  let index = BigInt(claim.withdrawalIndex);
  let hash = qledgerWithdrawalLeaf(CHAIN_ID, claim.rollupId, index, claim.recipient, BigInt(claim.amount));
  for (const sibling of claim.proof) {
    const bytes = hexToBytes(sibling);
    hash = (index & 1n) === 0n ? qorehash(hash, bytes) : qorehash(bytes, hash);
    index >>= 1n;
  }
  return bytesToHex(hash);
}

export function withdrawalMessage(claim, submitter) {
  return executeWithdrawalMsg({ submitter, rollupId: claim.rollupId, batchIndex: BigInt(claim.batchIndex),
    withdrawalIndex: BigInt(claim.withdrawalIndex), recipient: claim.recipient,
    denom: claim.denom, amount: BigInt(claim.amount), proof: claim.proof.map(hexToBytes) });
}

export function walletWithdrawalMessage(claim, submitter) {
  const message = withdrawalMessage(claim, submitter);
  return { typeUrl: message.typeUrl, value: createRdkRegistry().encode(message) };
}

function chainFetch(url, options) {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith('/api/diana/')) {
    const path = parsed.pathname.slice('/api/diana'.length) + parsed.search;
    return fetch(new URL('/api/chain?' + new URLSearchParams({ path }), parsed.origin), options);
  }
  return fetch(parsed, options);
}

async function requestJson(url) {
  const response = await chainFetch(url, { signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  if (!response.ok) throw new Error('Diana returned HTTP ' + response.status);
  return response.json();
}

export function chainClient(restBase = DIANA_REST) {
  return createRdkClient({
    network: 'testnet',
    endpoints: { rest: restBase },
    fetch: (url, opts) => chainFetch(url, {
      ...opts, cache: 'no-store', signal: AbortSignal.timeout(12_000),
    }),
  });
}

export async function readBatch(client, rollupId, batchIndex) {
  if (!ROLLUP_ID.test(rollupId)) throw new RecoveryError('Enter a valid rollup ID.');
  integer(batchIndex, 'Batch index', BigInt(Number.MAX_SAFE_INTEGER));
  try {
    const [rollup, batch] = await Promise.all([
      client.rest.getRollup(rollupId), client.rest.getBatch(rollupId, Number(batchIndex)),
    ]);
    if (rollup.rollupId !== rollupId || batch.rollupId !== rollupId || batch.batchIndex !== Number(batchIndex)) {
      throw new RecoveryError('Diana returned a different rollup or batch.');
    }
    return { rollup, batch };
  } catch (error) {
    if (isRestNotFound(error)) throw new RecoveryError('This rollup or batch is unavailable on Diana.');
    throw error;
  }
}

export async function readOperator(client, rollupId) {
  if (!ROLLUP_ID.test(rollupId)) throw new RecoveryError('Enter a valid rollup ID.');
  let rollup;
  try { rollup = await client.rest.getRollup(rollupId); }
  catch (error) {
    if (isRestNotFound(error)) throw new RecoveryError('This rollup was not found on Diana.');
    throw error;
  }
  if (rollup.rollupId !== rollupId) throw new RecoveryError('Diana returned a different rollup.');
  const inbox = rollup.executionVm === 'qledger-v1' ? await client.rest.getInbox(rollupId) : null;
  let batch;
  try { batch = await client.rest.getLatestBatch(rollupId); }
  catch (error) { if (!isRestNotFound(error)) throw error; }
  if (!batch?.rollupId) return { rollup, inbox, batch: null };
  if (batch.rollupId !== rollupId) throw new RecoveryError('Diana returned a batch from a different rollup.');
  let receiptVerified = false;
  try {
    const receipt = await buildSettlementReceipt(client, rollupId, batch.batchIndex);
    receiptVerified = (await verifySettlementReceipt(receipt, { client })).valid;
  } catch {
    // The batch can still be inspected if a covering anchor is unavailable.
  }
  return { rollup, inbox, batch, receiptVerified };
}

export async function findPayout(restBase, claim) {
  const event = 'rdk_withdrawal_executed';
  const query = new URLSearchParams({ query: [
    event + ".rollup_id='" + claim.rollupId + "'",
    event + ".batch_index='" + claim.batchIndex + "'",
    event + ".withdrawal_index='" + claim.withdrawalIndex + "'",
  ].join(' AND '), limit: '10' });
  const data = await requestJson(restBase + '/cosmos/tx/v1beta1/txs?' + query);
  if (!Array.isArray(data.tx_responses)) throw new Error('Diana did not return transaction results.');
  for (const tx of data.tx_responses) {
    if (tx.code !== 0 || !HASH.test(tx.txhash)) continue;
    const matches = tx.events?.some(item => {
      if (item.type !== event) return false;
      const attrs = Object.fromEntries(item.attributes.map(({ key, value }) => [key, value]));
      return attrs.rollup_id === claim.rollupId && attrs.batch_index === claim.batchIndex &&
        attrs.withdrawal_index === claim.withdrawalIndex && attrs.recipient === claim.recipient &&
        attrs.amount === claim.amount + 'uqor';
    });
    if (matches) return tx.txhash;
  }
  return null;
}

function checkProof(claim, rollup, batch) {
  if (rollup.executionVm !== 'qledger-v1' || batch.withdrawalsRootReduced) {
    throw new RecoveryError('Exit Kit supports Qledger v1 withdrawals on Diana.');
  }
  if (!batch.withdrawalsRoot || proofRoot(claim) !== bytesToHex(decodeWireBytes(batch.withdrawalsRoot))) {
    throw new RecoveryError('The proof does not match this batch’s withdrawal root.');
  }
}

export async function verifyRecovery(client, restBase, file) {
  const { rollup, batch } = await readBatch(client, file.rollupId, file.batchIndex);
  if (rollup.status === 'stopped' || !['submitted', 'challenged', 'finalized'].includes(batch.status)) {
    return { state: 'unavailable', batch, receiptVerified: false };
  }
  checkProof(file, rollup, batch);
  const verification = await verifySettlementReceipt(file.receipt, { client });
  if (!verification.valid) throw new RecoveryError('The signed settlement receipt could not be verified against Diana.');
  if (batch.status !== 'finalized') return { state: 'pending', batch, receiptVerified: true };
  const txHash = await findPayout(restBase, file);
  return { state: txHash ? 'paid' : 'ready', batch, receiptVerified: true, txHash };
}

async function prepareRecovery(client, fields) {
  const claim = claimFromFields(fields);
  const { rollup, batch } = await readBatch(client, claim.rollupId, claim.batchIndex);
  checkProof(claim, rollup, batch);
  let receipt;
  try { receipt = await buildSettlementReceipt(client, claim.rollupId, Number(claim.batchIndex)); }
  catch { throw new RecoveryError('Diana could not provide a signed settlement receipt for this batch.'); }
  return parseRecovery(JSON.stringify({ format: 'exit-kit-recovery', version: 1,
    chainId: CHAIN_ID, ...claim, receipt }));
}

export async function exportRecovery(client, restBase, fields) {
  const file = await prepareRecovery(client, fields);
  await verifyRecovery(client, restBase, file);
  return file;
}

export async function recoveryFromPayout(client, restBase, hash) {
  if (!HASH.test(hash)) throw new RecoveryError('Enter a valid Diana transaction hash.');
  let tx;
  try { tx = await client.rest.getTx(hash.toUpperCase()); }
  catch (error) {
    if (isRestNotFound(error)) throw new RecoveryError('This transaction was not found on Diana.');
    throw error;
  }
  if (tx.tx_response?.code !== 0) throw new RecoveryError('This transaction did not complete successfully.');
  const claims = tx.tx?.body?.messages?.filter(message => message['@type'] === '/qorechain.rdk.v1.MsgExecuteWithdrawal');
  if (claims?.length !== 1) throw new RecoveryError('Enter a transaction with one native rollup withdrawal.');
  const claim = claims[0];
  const file = await prepareRecovery(client, {
    rollupId: claim.rollup_id, batchIndex: claim.batch_index, withdrawalIndex: claim.withdrawal_index,
    recipient: claim.recipient, amount: claim.amount, proof: claim.proof.map(item => bytesToHex(decodeWireBytes(item))),
  });
  const status = await verifyRecovery(client, restBase, file);
  if (status.state !== 'paid' || status.txHash.toUpperCase() !== hash.toUpperCase()) {
    throw new RecoveryError('Diana could not confirm this transaction in the payout index.');
  }
  return { file, status };
}

export function formatAmount(uqor) {
  const amount = BigInt(uqor);
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (amount / 1_000_000n).toLocaleString('en-US') + (fraction ? '.' + fraction : '') + ' QOR';
}
