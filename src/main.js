import './style.css';
import './hero-motion.js';
import { CHAIN_ID, FILE_LIMIT, RecoveryError, formatAmount } from './recovery-common.js';

const rest = new URL('/api/diana', location.origin).href;
const $ = id => document.getElementById(id);
const explorer = 'https://explore.qore.network/tx/';
const knownRoutes = ['recover', 'withdrawals', 'operator', 'guide'];
const routeTargets = new Map([
  ['privacy', ['guide', 'privacy-heading']],
  ['find-withdrawal', ['withdrawals', 'payout-heading']],
  ['recovery-details', ['recover', 'result-heading']],
  ['open-recovery-file', ['recover', 'file-heading']],
  ['create-recovery-file', ['withdrawals', 'export-heading']],
  ['guide-save', ['guide', 'guide-save']],
  ['guide-verify', ['guide', 'guide-verify']],
  ['guide-claim', ['guide', 'guide-claim']],
  ['guide-troubleshoot', ['guide', 'guide-troubleshoot']],
]);
let currentFile = null;
let currentStatus = null;
let requestId = 0;
let claimInProgress = false;
let recoveryModule;

function loadRecovery() {
  recoveryModule ??= import('./recovery.js').then(module => ({
    ...module, client: module.chainClient(rest),
  })).catch(error => {
    recoveryModule = undefined;
    throw error;
  });
  return recoveryModule;
}

function route({ moveFocus = false } = {}) {
  const requested = location.hash.slice(1);
  const target = routeTargets.get(requested);
  const [active, heading] = target ??
    (knownRoutes.includes(requested) ? [requested, requested + '-heading'] : ['recover', 'recover-heading']);
  for (const id of knownRoutes) $(id).hidden = id !== active;
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.hash === '#' + active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const link of document.querySelectorAll('[data-guide-link]')) {
    if (link.hash === location.hash) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  if (requested === 'create-recovery-file') $('proof-tools').open = true;
  if (target) {
    $(heading).focus();
  } else if (moveFocus) {
    window.scrollTo(0, 0);
    $(heading).focus({ preventScroll: true });
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
  const link = node('a', 'View payout on Diana ↗', 'payout-link');
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

const stateDescriptions = {
  checking: 'Verifying the signed receipt and withdrawal proof against QoreChain.',
  ready: 'Review the destination before approving the claim in QoreX.',
  pending: 'The batch must finalize on QoreChain before you can claim.',
  paid: 'Diana has recorded the payout to the recipient below.',
  unavailable: 'The withdrawal could not be confirmed. Check again for the latest chain status.',
  rejected: 'Replace the file if you downloaded another copy from your rollup.',
};

function selectFile(name, state, status) {
  $('dropzone').hidden = true;
  $('file-loaded').hidden = false;
  $('file-loaded').dataset.state = state;
  $('file-name').textContent = name;
  $('file-state').textContent = status;
}

function renderEmpty(title = 'Open a recovery file to begin',
  copy = 'You’ll see the amount, recipient, and whether the withdrawal is ready to claim.') {
  $('result').hidden = true;
  $('result').replaceChildren();
  $('result').removeAttribute('aria-busy');
  $('result-empty').hidden = false;
  $('empty-title').textContent = title;
  $('empty-copy').textContent = copy;
}

function clearFile() {
  if (claimInProgress) return;
  ++requestId;
  currentFile = null;
  currentStatus = null;
  $('file-loaded').hidden = true;
  $('file-name').textContent = '';
  $('file-state').textContent = '';
  $('file-input').value = '';
  $('dropzone').hidden = false;
  renderEmpty();
  $('result-announcement').textContent = 'Recovery file cleared.';
  feedback('file-feedback', '');
  feedback('recover-feedback', '');
  $('choose-file').focus();
}

function renderFile(status = { state: 'checking' }) {
  if (!currentFile) return;
  currentStatus = status;
  const file = currentFile;
  const view = node('div', '', 'result-body');
  const badge = node('span', states[status.state], 'status');
  badge.dataset.state = status.state;
  let disclosure;
  if (status.receiptVerified) {
    const amountCard = node('div', '', 'amount-card');
    const summary = node('div', '', 'amount-header');
    summary.append(node('span', 'Withdrawal amount', 'amount-label'), badge);
    amountCard.append(summary, node('p', formatAmount(file.amount), 'amount'),
      node('p', stateDescriptions[status.state], 'state-copy'));
    const recipient = node('div', '', 'recipient-value');
    const copy = controls('Copy address', () => copyRecipient(file.recipient));
    copy.className = 'button text-button';
    copy.setAttribute('aria-label', 'Copy recipient address');
    recipient.append(node('span', file.recipient), copy);
    view.append(amountCard, detailList([['Recipient', recipient]]));
    if (status.txHash) view.append(txLink(status.txHash));
  } else {
    const state = node('div', '', 'result-state');
    state.append(badge, node('p', stateDescriptions[status.state], 'state-copy'));
    if (status.state === 'checking') {
      const skeleton = node('div', '', 'verification-skeleton');
      skeleton.setAttribute('aria-hidden', 'true');
      skeleton.append(node('span'), node('span'), node('span'));
      state.append(skeleton);
    }
    view.append(state);
  }
  if (status.receiptVerified) {
    disclosure = node('details', '', 'verification');
    disclosure.append(node('summary', 'View verification'));
    const checks = node('ul', '', 'checks');
    for (const check of [
      'Receipt matches the rollup and batch on Diana.',
      'ML-DSA settlement signature verified.',
      'Merkle proof binds the displayed recipient and amount.',
      status.state === 'pending' ? 'Batch is awaiting finality.' : 'Batch is finalized on QoreChain.',
    ]) checks.append(node('li', check));
    const references = [['Rollup', file.rollupId], ['Batch', '#' + file.batchIndex]];
    if (status.txHash) references.push(['L1 transaction', status.txHash]);
    disclosure.append(checks, detailList(references));
  }
  if (status.state !== 'checking') {
    const actions = node('div', '', 'actions');
    if (status.state === 'ready') {
      const claim = controls(claimInProgress ? 'Claim in progress…' : 'Claim with QoreX', claimWithWallet, true);
      claim.id = 'claim-button';
      claim.disabled = claimInProgress;
      actions.append(claim);
      actions.append(controls('Copy command', copyCommand));
    }
    if (status.state === 'paid') actions.append(controls('Save recovery file', () => download(file)));
    const refresh = controls('Check again', () => refreshClaim({ moveFocus: true }));
    refresh.id = 'refresh-claim';
    refresh.disabled = claimInProgress;
    actions.append(refresh);
    view.append(actions);
  }
  if (disclosure) view.append(disclosure);
  $('result').replaceChildren(view);
  $('result').hidden = false;
  $('result-empty').hidden = true;
  $('result').setAttribute('aria-busy', String(status.state === 'checking'));
  $('result-announcement').textContent = status.receiptVerified
    ? states[status.state] + '. ' + formatAmount(file.amount) + '.'
    : states[status.state] + '.';
}

async function refreshClaim({ moveFocus = false } = {}) {
  if (!currentFile) return;
  const id = ++requestId;
  if (moveFocus) $('result-heading').focus({ preventScroll: true });
  feedback('recover-feedback', '');
  renderFile();
  try {
    const { client, verifyRecovery } = await loadRecovery();
    if (id !== requestId) return;
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
  if (!file || claimInProgress) return;
  const id = ++requestId;
  currentFile = null;
  currentStatus = null;
  renderEmpty('Reading your recovery file', 'Exit Kit is checking the JSON on this device.');
  $('result-announcement').textContent = '';
  const choosing = document.activeElement === $('choose-file');
  selectFile(file.name, 'reading', 'Reading on this device…');
  if (choosing) $('replace-file').focus({ preventScroll: true });
  feedback('recover-feedback', '');
  feedback('file-feedback', '');
  try {
    if (file.size > FILE_LIMIT) throw new RecoveryError('Choose a recovery file that is 64 KB or smaller.');
    const [{ parseRecovery }, text] = await Promise.all([loadRecovery(), file.text()]);
    const decoded = parseRecovery(text);
    if (id !== requestId) return;
    currentFile = decoded;
    selectFile(file.name, 'loaded', 'Opened on this device');
    if ($('replace-file') === document.activeElement) $('result-heading').focus();
    await refreshClaim();
  } catch (error) {
    if (id === requestId) {
      selectFile(file.name, 'error', 'Could not open this file');
      renderEmpty('Withdrawal details unavailable', 'Choose another recovery file to continue.');
      feedback('file-feedback', error instanceof RecoveryError
        ? error.message : 'Exit Kit couldn’t read the file. Try opening it again.', 'error');
    }
  }
}

async function copyRecipient(address) {
  try {
    await navigator.clipboard.writeText(address);
    feedback('recover-feedback', 'Recipient address copied.', 'good');
  } catch {
    feedback('recover-feedback', 'Clipboard access is unavailable. You can select and copy the address above.', 'error');
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
  if (claimInProgress) return;
  const wallet = window.qorex?.native;
  if (!wallet?.enable || !wallet?.signAndBroadcast) {
    feedback('recover-feedback', 'Open Exit Kit in QoreX or use Copy command to submit with your own signer.', 'error');
    return;
  }
  const file = currentFile;
  if (!file || currentStatus?.state !== 'ready') return;
  const id = requestId;
  const button = event.currentTarget;
  claimInProgress = true;
  button.disabled = true;
  button.textContent = 'Claim in progress…';
  $('replace-file').disabled = true;
  $('clear-file').disabled = true;
  $('refresh-claim').disabled = true;
  feedback('recover-feedback', 'Checking the claim before asking QoreX to sign.');
  try {
    const { client, verifyRecovery, walletWithdrawalMessage } = await loadRecovery();
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
    claimInProgress = false;
    $('replace-file').disabled = false;
    $('clear-file').disabled = false;
    if ($('claim-button')) {
      $('claim-button').disabled = false;
      $('claim-button').textContent = 'Claim with QoreX';
    }
    if ($('refresh-claim')) $('refresh-claim').disabled = false;
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
    const { client, readBatch } = await loadRecovery();
    const { rollup, batch } = await readBatch(client, fields.rollupId.trim(), fields.batchIndex.trim());
    $('batch-result').replaceChildren(detailList([
      ['Rollup', rollup.rollupId], ['Settlement', batch.status], ['Batch', '#' + batch.batchIndex],
      ['Execution', rollup.executionVm || 'Not reported'], ['Withdrawal root', batch.withdrawalsRoot || 'None'],
    ]));
    $('batch-result').hidden = false;
    const exportForm = $('export-form');
    exportForm.elements.rollupId.value = rollup.rollupId;
    exportForm.elements.batchIndex.value = batch.batchIndex;
    $('batch-result').append(controls('Use this batch to create a file', () => {
      $('proof-tools').open = true;
      exportForm.elements.withdrawalIndex.focus();
    }));
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
    const { client, exportRecovery } = await loadRecovery();
    download(await exportRecovery(client, rest, fields));
    feedback('export-feedback', 'Recovery file saved. Keep a copy somewhere you can access later.', 'good');
  } catch (error) { feedback('export-feedback', messageFor(error), 'error'); }
  finally { button.disabled = false; }
});

$('payout-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (claimInProgress) {
    feedback('payout-feedback', 'Finish or cancel the open QoreX request before changing withdrawals.');
    return;
  }
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const id = requestId;
  button.disabled = true;
  feedback('payout-feedback', 'Checking the payout and signed settlement receipt.');
  try {
    const { client, recoveryFromPayout } = await loadRecovery();
    const { file, status } = await recoveryFromPayout(client, rest, formValues(form).hash.trim());
    if (id !== requestId || claimInProgress) return;
    ++requestId;
    currentFile = file;
    selectFile('Recovered from Diana transaction', 'loaded', 'Rebuilt from the confirmed payout');
    renderFile(status);
    feedback('file-feedback', '');
    feedback('recover-feedback', '');
    feedback('payout-feedback', '');
    location.hash = 'recovery-details';
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
    const { client, readOperator } = await loadRecovery();
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

$('skip-link').addEventListener('click', event => {
  event.preventDefault();
  ($('recover').hidden ? $('content') : $('file-heading')).focus();
});
$('clear-file').addEventListener('click', clearFile);
for (const id of ['choose-file', 'replace-file']) $(id).addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', event => {
  void readFile(event.target.files[0]);
  event.target.value = '';
});
for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
  $('file-panel').addEventListener(type, event => {
    if (type !== 'dragleave' && !Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    if (type === 'dragleave' && $('file-panel').contains(event.relatedTarget)) return;
    $('file-panel').classList.toggle('over', !claimInProgress && (type === 'dragenter' || type === 'dragover'));
    if (type === 'drop') void readFile(event.dataTransfer.files[0]);
  });
}
window.addEventListener('hashchange', () => route({ moveFocus: true }));
route();
const params = new URLSearchParams({ path: '/qorechain/rdk/v1/params' });
fetch('/api/chain?' + params, { signal: AbortSignal.timeout(12_000), cache: 'no-store' }).then(response => {
  if (!response.ok) throw new Error('Network unavailable');
  $('network-dot').classList.add('live');
  $('network-dot').parentElement.dataset.connection = 'online';
  $('network-dot').parentElement.title = 'Diana is reachable';
  $('network-status').textContent = 'Network reachable';
}).catch(() => {
  $('network-dot').parentElement.dataset.connection = 'offline';
  $('network-dot').parentElement.title = 'Diana could not be reached';
  $('network-status').textContent = 'Network unavailable';
});
