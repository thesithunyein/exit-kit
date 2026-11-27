import './style.css';
import {
  CHAIN_ID, FILE_LIMIT, RecoveryError, chainClient, exportRecovery, formatAmount,
  parseRecovery, readBatch, readOperator, recoveryFromPayout, verifyRecovery, walletWithdrawalMessage,
} from './recovery.js';

const rest = new URL('/api/diana', location.origin).href;
const client = chainClient(rest);
const $ = id => document.getElementById(id);
const explorer = 'https://explore.qore.network/tx/';
const knownRoutes = ['recover', 'withdrawals', 'operator', 'guide'];
let currentFile = null;
let currentStatus = null;
let requestId = 0;

function route() {
  const requested = location.hash.slice(1);
  const active = knownRoutes.includes(requested) ? requested : 'recover';
  for (const id of knownRoutes) $(id).hidden = id !== active;
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.hash === '#' + active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content) element.textContent = content;
  if (className) element.className = className;
  return element;
}

function feedback(id, message, tone = 'neutral') {
  const element = $(id);
  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = !message;
}

function messageFor(error) {
  return error instanceof RecoveryError ? error.message : 'Diana could not be reached. Try again.';
}

function detailList(rows) {
  const list = node('dl', '', 'details');
  for (const [label, value] of rows) {
    const entry = node('div');
    const description = node('dd');
    if (value instanceof HTMLElement) description.append(value);
    else description.textContent = value;
    entry.append(node('dt', label), description);
    list.append(entry);
  }
  return list;
}

function controls(title, callback, primary = false) {
  const button = node('button', title, 'button ' + (primary ? 'primary' : 'secondary'));
  button.type = 'button';
  button.addEventListener('click', callback);
  return button;
}

function txLink(txHash) {
  const link = node('a', txHash);
  link.href = explorer + txHash;
  link.target = '_blank';
  link.rel = 'noreferrer';
  return link;
}

const states = {
  checking: 'Checking Diana',
  ready: 'Ready to claim',
  pending: 'Waiting for finality',
  paid: 'Already claimed',
  unavailable: 'Unable to verify',
  rejected: 'Verification failed',
};

function renderFile(status = { state: 'checking' }) {
  if (!currentFile) return;
  currentStatus = status;
  const file = currentFile;
  const view = node('div', '', 'result-body');
  const badge = node('span', states[status.state], 'status');
  badge.dataset.state = status.state;
  const details = [
    ['Recipient', file.recipient], ['Rollup', file.rollupId], ['Batch', '#' + file.batchIndex],
  ];
  if (status.txHash) details.push(['L1 transaction', txLink(status.txHash)]);
  view.append(badge, node('p', formatAmount(file.amount), 'amount'), detailList(details));
  if (status.receiptVerified) {
    const disclosure = node('details');
    disclosure.append(node('summary', 'View verification'));
    const checks = node('ul', '', 'checks');
    for (const check of [
      'Receipt matches the rollup and batch on Diana.',
      'ML-DSA settlement signature verified.',
      'Merkle proof binds the displayed recipient and amount.',
      status.state === 'pending' ? 'Batch is awaiting finality.' : 'Batch is finalized on QoreChain.',
    ]) checks.append(node('li', check));
    disclosure.append(checks);
    view.append(disclosure);
  }
  if (status.state !== 'checking') {
    const actions = node('div', '', 'actions');
    if (status.state === 'ready') {
      actions.append(controls('Claim with QoreX', claimWithWallet, true));
      actions.append(controls('Copy command', copyCommand));
    }
    if (status.state === 'paid') actions.append(controls('Save recovery file', () => download(file)));
    actions.append(controls('Check again', refreshClaim));
    view.append(actions);
  }
  $('result').replaceChildren(view);
  $('result').hidden = false;
  $('result-empty').hidden = true;
}

async function refreshClaim() {
  if (!currentFile) return;
  const id = ++requestId;
  feedback('recover-feedback', '');
  renderFile();
  try {
    const verified = await verifyRecovery(client, rest, currentFile);
    if (id !== requestId) return;
    renderFile(verified);
    if (verified.state === 'unavailable') feedback('recover-feedback', 'This rollup or batch cannot currently pay a withdrawal.', 'error');
  } catch (error) {
    if (id !== requestId) return;
    renderFile({ state: error instanceof RecoveryError ? 'rejected' : 'unavailable' });
    feedback('recover-feedback', messageFor(error), 'error');
  }
}

async function readFile(file) {
  if (!file) return;
  const id = ++requestId;
  currentFile = null;
  currentStatus = null;
  $('result').hidden = true;
  $('result-empty').hidden = false;
  $('file-name').textContent = file.name;
  $('file-loaded').hidden = false;
  $('dropzone').hidden = true;
  feedback('recover-feedback', '');
  try {
    if (file.size > FILE_LIMIT) throw new RecoveryError('Choose a recovery file smaller than 64 KB.');
    const decoded = parseRecovery(await file.text());
    if (id !== requestId) return;
    currentFile = decoded;
    await refreshClaim();
  } catch (error) {
    if (id === requestId) feedback('recover-feedback', messageFor(error), 'error');
  }
}

async function copyCommand() {
  const f = currentFile;
  const parts = ['qorechaind tx rdk execute-withdrawal', f.rollupId, f.batchIndex,
    f.withdrawalIndex, f.recipient, f.denom, f.amount];
  if (f.proof.length) parts.push('--proof', f.proof.join(','));
  parts.push('--node https://rpc-testnet.qore.host', '--chain-id qorechain-diana', '--from YOUR_TESTNET_KEY',
    '--generate-only');
  try {
    await navigator.clipboard.writeText(parts.join(' '));
    feedback('recover-feedback', 'Unsigned transaction command copied. See the guide for hybrid signing.', 'good');
  } catch {
    feedback('recover-feedback', 'Clipboard access is unavailable. Use the withdrawal command in the guide.', 'error');
  }
}

async function claimWithWallet(event) {
  const wallet = window.qorex?.native;
  if (!wallet?.enable || !wallet?.signAndBroadcast) {
    feedback('recover-feedback', 'Open Exit Kit in QoreX or use Copy command to submit with your own signer.', 'error');
    return;
  }
  const file = currentFile;
  if (!file || currentStatus?.state !== 'ready') return;
  const id = requestId;
  const button = event.currentTarget;
  button.disabled = true;
  feedback('recover-feedback', 'Checking the claim before asking QoreX to sign.');
  try {
    const status = await verifyRecovery(client, rest, file);
    if (id !== requestId) return;
    if (status.state !== 'ready') { renderFile(status); feedback('recover-feedback', ''); return; }
    await wallet.enable(CHAIN_ID);
    const account = await wallet.getKey(CHAIN_ID);
    if (id !== requestId) return;
    const message = walletWithdrawalMessage(file, account.bech32Address);
    feedback('recover-feedback', 'Review the withdrawal and fee in QoreX.');
    const result = await wallet.signAndBroadcast({ chainId: CHAIN_ID,
      messages: [message], gasLimit: 400000 });
    if (id !== requestId) return;
    if (Number(result.code) !== 0) throw new Error('Chain rejected the transaction.');
    await refreshClaim();
    if (currentStatus?.state !== 'paid') {
      feedback('recover-feedback', 'QoreX returned a transaction. Check again after Diana indexes the payout.');
    }
  } catch (error) {
    if (id !== requestId) return;
    const reason = String(error?.message || '');
    if (error?.code === 4001) feedback('recover-feedback', 'Signing was canceled. You can try again.', 'error');
    else if (/cannot show|unknown message|unsupported|not supported/i.test(reason)) {
      feedback('recover-feedback', 'This QoreX version cannot display the withdrawal. Use Copy command to submit independently.', 'error');
    } else {
      feedback('recover-feedback', 'QoreX could not confirm the claim. Check your testnet connection and fee balance, then check the withdrawal again.', 'error');
    }
  } finally {
    button.disabled = false;
  }
}

function download(file) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' }));
  const link = node('a');
  link.href = url;
  link.download = [file.rollupId, file.batchIndex, file.withdrawalIndex].join('-') + '.recovery.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function formValues(form) {
  return Object.fromEntries(new FormData(form));
}

$('batch-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = formValues(form);
  const button = form.querySelector('button');
  button.disabled = true;
  $('batch-result').hidden = true;
  feedback('batch-feedback', 'Reading the rollup and batch from Diana.');
  try {
    const { rollup, batch } = await readBatch(client, fields.rollupId.trim(), fields.batchIndex.trim());
    $('batch-result').replaceChildren(detailList([
      ['Rollup', rollup.rollupId], ['Settlement', batch.status], ['Batch', '#' + batch.batchIndex],
      ['Execution', rollup.executionVm || 'Not reported'], ['Withdrawal root', batch.withdrawalsRoot || 'None'],
    ]));
    $('batch-result').hidden = false;
    const exportForm = $('export-form');
    exportForm.elements.rollupId.value = rollup.rollupId;
    exportForm.elements.batchIndex.value = batch.batchIndex;
    feedback('batch-feedback', '');
  } catch (error) { feedback('batch-feedback', messageFor(error), 'error'); }
  finally { button.disabled = false; }
});

$('export-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const fields = Object.fromEntries(Object.entries(formValues(form)).map(([key, value]) => [key, value.trim()]));
  fields.proof = fields.proof.split(/[\s,]+/).filter(Boolean);
  button.disabled = true;
  feedback('export-feedback', 'Checking the signed receipt and withdrawal proof.');
  try {
    download(await exportRecovery(client, rest, fields));
    feedback('export-feedback', 'Recovery file saved. Keep a copy somewhere you can access later.', 'good');
  } catch (error) { feedback('export-feedback', messageFor(error), 'error'); }
  finally { button.disabled = false; }
});

$('payout-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const id = ++requestId;
  button.disabled = true;
  feedback('payout-feedback', 'Checking the payout and signed settlement receipt.');
  try {
    const { file, status } = await recoveryFromPayout(client, rest, formValues(form).hash.trim());
    if (id !== requestId) return;
    currentFile = file;
    $('file-name').textContent = 'Recovered from Diana transaction';
    $('file-loaded').hidden = false;
    $('dropzone').hidden = true;
    renderFile(status);
    feedback('payout-feedback', '');
    location.hash = 'recover';
  } catch (error) {
    if (id === requestId) feedback('payout-feedback', messageFor(error), 'error');
  } finally {
    button.disabled = false;
  }
});

$('operator-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  $('operator-result').hidden = true;
  $('operator-empty').hidden = true;
  feedback('operator-feedback', 'Reading the rollup’s latest state from Diana.');
  try {
    const status = await readOperator(client, formValues(form).operatorRollupId.trim());
    const facts = [
      ['Rollup', status.rollup.rollupId], ['Status', status.rollup.status],
      ['Execution', status.rollup.executionVm || 'Not reported'],
      ['Latest batch', status.batch ? '#' + status.batch.batchIndex : 'No batch yet'],
    ];
    if (status.inbox) facts.push(['Inbox sequence', String(status.inbox.headSequence)],
      ['Consumed through', String(status.inbox.consumedSequence)]);
    if (status.batch) facts.push(['Settlement', status.batch.status],
      ['Signed receipt', status.receiptVerified ? 'Verified' : 'Could not verify']);
    $('operator-result').replaceChildren(detailList(facts));
    $('operator-result').hidden = false;
    feedback('operator-feedback', '');
  } catch (error) { feedback('operator-feedback', messageFor(error), 'error'); }
  finally { button.disabled = false; }
});

for (const id of ['choose-file', 'replace-file']) $(id).addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', event => {
  void readFile(event.target.files[0]);
  event.target.value = '';
});
for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
  $('dropzone').addEventListener(type, event => {
    event.preventDefault();
    $('dropzone').classList.toggle('over', type === 'dragenter' || type === 'dragover');
    if (type === 'drop') void readFile(event.dataTransfer.files[0]);
  });
}
window.addEventListener('hashchange', route);
route();
client.params().then(() => {
  $('network-dot').classList.add('live');
  $('network-dot').parentElement.title = 'Diana responded';
}).catch(() => {
  $('network-dot').parentElement.title = 'Diana could not be reached';
});
