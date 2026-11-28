# Verification

## Public Diana compatibility checks

- Exit Kit independently verified the published Vigil payout for `vigil-pay-1`, batch 18, withdrawal 4. The rebuilt proof matched Diana’s withdrawals root, the signed receipt verified at anchor height 10,686,374, and Diana’s payout index returned the original 0.1 QOR transaction. [Recovery file](evidence/vigil-payout.json) · [Diana payout](https://explore.qore.network/tx/258430D7FA0F4DB3CA8D2ABFF50C3247B1FF66058D02AFB293775ADDBD51A21C) · [Vigil evidence](https://github.com/Manuel-dev01/Vigil/blob/main/EVIDENCE.md)
- The browser recovered the same historical paid withdrawal, downloaded its file, rejected a modified amount, and reopened the receipt by transaction hash. A separate live-chain verifier run rejected changes to both the amount and the recipient against the same withdrawal root. [Exit Kit](https://exit-kit-alpha.vercel.app/)
- On 28 November 2026 at 03:01 UTC, the signerless watchtower replayed all 12 finalized batches of `skyproof-1`, checked their signed receipts and roots, and reached inbox sequence 96. Set `EXIT_KIT_ROLLUP=skyproof-1` and run `node scripts/rollup.mjs watch` while the required Diana history is available. [Watchtower report](evidence/skyproof-watch.json) · [SkyProof project](https://build.qorechain.io/p/skyproof)

```sh
node scripts/claim.mjs evidence/vigil-payout.json
node scripts/check-diana.mjs
```

## Local tests

`npm test` checks Qledger tree compatibility, tamper rejection, numeric boundaries, network binding, message construction, and the public-read proxy allowlist. It also seals and opens an ML-KEM responder note through the operator CLI’s envelope helper and rejects the wrong recipient key and rollup ID. The ML-KEM test uses ephemeral keys.

## Exit Kit-owned Diana run

The public payout and watchtower data above come from Vigil and SkyProof. The Exit Kit-owned payout, operator-offline recording, and live ML-KEM registration and handoff remain pending.

The Diana preflight found `exit-kit-diana` unregistered and the project operator with 0 spendable test QOR. Live parameters put the minimum stake and bond at 12,000 QOR before deposits and fees. [Operator-offline runbook](DIANA_RUN.md)
