export const CHAIN_ID = 'qorechain-diana';
export const FILE_LIMIT = 64 * 1024;

export class RecoveryError extends Error {}

export function formatAmount(uqor) {
  const amount = BigInt(uqor);
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (amount / 1_000_000n).toLocaleString('en-US') + (fraction ? '.' + fraction : '') + ' QOR';
}
