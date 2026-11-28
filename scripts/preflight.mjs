import { isCanonicalQorAddress, isRestNotFound } from '@qorechain/rdk';
import { CHAIN_ID, DIANA_REST, ROLLUP_ID, chainClient, formatAmount } from '../src/recovery.js';

async function publicRead(path) {
  const response = await fetch(DIANA_REST + path, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Diana returned HTTP ' + response.status + ' for ' + path);
  return response.json();
}

try {
  const address = process.argv[2];
  const rollupId = process.argv[3] || process.env.EXIT_KIT_ROLLUP || 'exit-kit-diana';
  if (!address || !isCanonicalQorAddress(address) || !ROLLUP_ID.test(rollupId)) {
    throw new Error('Usage: node scripts/preflight.mjs <operator-qor1-address> [rollup-id]');
  }
  const client = chainClient();
  const [rollup, rdk, multilayer, spendable] = await Promise.all([
    client.rest.getRollup(rollupId).catch(error => {
      if (isRestNotFound(error)) return null;
      throw error;
    }),
    client.params(),
    publicRead('/qorechain/multilayer/v1/params'),
    publicRead('/cosmos/bank/v1beta1/spendable_balances/' + address + '/by_denom?denom=uqor'),
  ]);
  if (spendable.balance?.denom !== 'uqor') throw new Error('Diana did not return a QOR balance.');
  const rollupStake = BigInt(rdk.minStakeForRollup);
  const layerStake = BigInt(multilayer.params.min_sidechain_stake);
  const submitterBond = BigInt(rdk.minSubmitterBond);
  const balance = BigInt(spendable.balance.amount);
  const freshRunStakeAndBond = rollupStake + layerStake + submitterBond;
  const shortfall = rollup || balance >= freshRunStakeAndBond ? 0n : freshRunStakeAndBond - balance;
  console.log(JSON.stringify({
    network: CHAIN_ID,
    operator: address,
    rollupId,
    rollupStatus: rollup?.status ?? 'not created',
    creator: rollup?.creator ?? null,
    spendable: formatAmount(balance.toString()),
    newRollupStake: formatAmount(rollupStake.toString()),
    newLayerStake: formatAmount(layerStake.toString()),
    minimumSubmitterBond: formatAmount(submitterBond.toString()),
    freshRunStakeAndBond: formatAmount(freshRunStakeAndBond.toString()),
    freshRunShortfall: rollup ? null : formatAmount(shortfall.toString()),
    note: rollup
      ? 'For an existing rollup, check its layer, current bond, and remaining fees before submitting.'
      : 'The fresh-run minimum excludes deposits and network fees.',
  }, null, 2));
  if (shortfall > 0n || (rollup && rollup.creator !== address)) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
