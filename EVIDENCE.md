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

- On 28 November 2026, the operator created `exit-kit-diana`. The Diana registry reports an active Qledger v1 rollup with a registered sidechain layer. The layer was listed as proposed at the time of the check. [Rollup creation transaction](https://explore.qore.network/tx/E6B2BA463C17901CA986F72CC079A1A6CE914387909190042A76534E2BA8823B)
- The same operator registered its ML-KEM key on Diana. The CLI fetched that registered key, encrypted a local rehearsal note, and decrypted it successfully with the recipient’s local key. Both plaintext copies had SHA-256 `89454776138d4854d72002624afd616cddaf654c98d842a7b72e55aa22cff5f4`. [KEM registration transaction](https://explore.qore.network/tx/DEA04DE1A5CEBB552166F3918FD26C59094A96A38CF28618CEFA45EB2B64C493)
- The operator had 999.745079 spendable test QOR after deployment and key registration. The 1,000 QOR submitter bond, deposit and fees still need funding. The project-owned signed batch, payout and operator-offline recording remain pending. [Operator-offline runbook](DIANA_RUN.md)
