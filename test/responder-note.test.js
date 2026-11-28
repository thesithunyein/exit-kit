import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSealKeys } from '@qorechain/qoreseal';
import { openResponderNote, sealResponderNote } from '../scripts/responder-note.mjs';

test('ML-KEM responder notes are bound to the recipient and rollup', () => {
  const recipient = generateSealKeys();
  const otherRecipient = generateSealKeys();
  const note = new TextEncoder().encode('Recovery handoff for withdrawal 4.');
  const sealed = sealResponderNote('exit-kit-diana', recipient.mlkemPublicKey, note);

  assert.deepEqual(openResponderNote('exit-kit-diana', recipient, sealed), note);
  assert.throws(() => openResponderNote('exit-kit-diana', otherRecipient, sealed));
  assert.throws(() => openResponderNote('another-diana-rollup', recipient, sealed));
});
