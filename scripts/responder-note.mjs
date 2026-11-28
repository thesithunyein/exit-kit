import { envelopeFromText, envelopeToText, open, seal } from '@qorechain/qoreseal';
import { CHAIN_ID } from '../src/recovery-common.js';

const purpose = 'exit-kit-operator-note';

export function sealResponderNote(rollupId, mlkemPublicKey, plaintext) {
  return envelopeToText(seal({
    chainId: CHAIN_ID,
    purpose,
    mode: 'mlkem',
    recipients: [{ mlkemPublicKey }],
    plaintext,
    aad: new TextEncoder().encode(rollupId),
  }));
}

export function openResponderNote(rollupId, keys, envelope) {
  return open({
    chainId: CHAIN_ID,
    purpose,
    envelope: envelopeFromText(envelope.trim()),
    keys,
    aad: new TextEncoder().encode(rollupId),
  });
}
