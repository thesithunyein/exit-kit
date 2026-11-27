import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, qledgerWithdrawalProof, qledgerWithdrawalsRoot } from '@qorechain/rdk';
import { CHAIN_ID, claimFromFields, formatAmount, parseRecovery, proofRoot, withdrawalMessage } from '../src/recovery.js';
import { allowedChainPath } from '../server/chain.js';

const recipient = 'qor1k44vs60vpjqn6rlgy62d8e6v79lsln9a9eyucy';
const another = 'qor1vwqwy8nqj060e8ufdze7qlnsq7lsjaxsfhf8hn';
const rollupId = 'exit-kit-diana';
const withdrawals = [
  { index: 4294967297n, recipient, amount: 100_000n },
  { index: 4294967298n, recipient: another, amount: 53n },
];
const base = { rollupId, batchIndex: '18', withdrawalIndex: '4294967297', amount: '100000', recipient,
  proof: qledgerWithdrawalProof(CHAIN_ID, rollupId, withdrawals, 0).map(bytesToHex) };

test('proof matches official Qledger tree for a global index above 32 bits', () => {
  const root = bytesToHex(qledgerWithdrawalsRoot(CHAIN_ID, rollupId, withdrawals));
  assert.equal(proofRoot(claimFromFields(base)), root);
  assert.notEqual(proofRoot(claimFromFields({ ...base, recipient: another })), root);
  assert.notEqual(proofRoot(claimFromFields({ ...base, amount: '100001' })), root);
});

test('rejects malformed proofs, money, addresses, and wrong network', () => {
  assert.throws(() => claimFromFields({ ...base, proof: ['xyz'] }), /Merkle/);
  assert.throws(() => claimFromFields({ ...base, amount: '9223372036854775808' }), /range/);
  assert.throws(() => claimFromFields({ ...base, recipient: 'qor1invalid' }), /valid QoreChain/);
  assert.throws(() => parseRecovery(JSON.stringify({ format: 'exit-kit-recovery', version: 1, denom: 'uqor',
    chainId: 'qorechain-vladi', ...base })), /another network/);
});

test('native message retains the verified payout and the fee payer is separate', () => {
  const message = withdrawalMessage(claimFromFields(base), another);
  assert.equal(message.typeUrl, '/qorechain.rdk.v1.MsgExecuteWithdrawal');
  assert.equal(message.value.submitter, another);
  assert.equal(message.value.recipient, recipient);
  assert.equal(message.value.withdrawalIndex, 4294967297n);
  assert.equal(formatAmount('100001'), '0.100001 QOR');
});

test('Diana proxy disallows arbitrary hosts and unindexed transaction queries', () => {
  assert.ok(allowedChainPath('/qorechain/rdk/v1/batch/exit-kit-diana/18'));
  const query = new URLSearchParams({ limit: '10',
    query: "rdk_withdrawal_executed.rollup_id='vigil-pay-1' AND rdk_withdrawal_executed.batch_index='18' AND rdk_withdrawal_executed.withdrawal_index='4'" });
  assert.ok(allowedChainPath('/cosmos/tx/v1beta1/txs?' + query));
  assert.equal(allowedChainPath('//other.example/anything'), null);
  assert.equal(allowedChainPath('/cosmos/tx/v1beta1/txs?query=anything&limit=10'), null);
});
