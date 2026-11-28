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
- After the second testnet top-up, the operator posted the 1,000 QOR submitter bond and deposited 2 QOR into its L2 account. Batch 0 anchored the deposit. [Bond](https://explore.qore.network/tx/442748CB15E1BFA70DE70A15264E7598B5581F75EC16D7B509DD935B88B59EE3) · [Deposit](https://explore.qore.network/tx/904DCDF1681B4B2B26AE805BB47863650F4513A288AD1ACADEE0710D1A090025) · [Batch 0](https://explore.qore.network/tx/6665380CAF324F8E4F6A1C84A6193C0ECECADB170D0D8FF9D4F4778019FABBCC)
- The operator requested a 1 QOR withdrawal to the independent recipient `qor1cply049ldnppjzam2sp59wr0vhph9w8s3qk262`. The signerless watchtower replayed the inbox, matched batch 1’s withdrawals root, and verified its ML-DSA receipt at anchor height 10,892,745. [Withdrawal request](https://explore.qore.network/tx/AE9E52BF1C4A794475C5D15F15A1238DFD9F7563572418953EDC1E4128A48BD0) · [Signed withdrawal batch](https://explore.qore.network/tx/3B34F8C270637F8FF9F3B3C512791EB7362BB1180B4029E55F5815338759CD9E) · [Watchtower report](evidence/exit-kit-watch-pending.json)
- The independent recipient registered its own ML-KEM key on Diana. A note for batch 1, withdrawal 0 was sealed using its registered key and opened locally. The original and decoded handoff both had SHA-256 `e8a08ad340f981888ef8c9bb6b84c5b45ab0c944e25b59752b139ddaf08ba244`. [Recipient funding](https://explore.qore.network/tx/E84F98B8D1508E111388C800469C82ADABADE8123874DA3FAA11E629D372DDE5) · [Recipient KEM registration](https://explore.qore.network/tx/74F1CF0EA8AB33759EE086967D05B67ABB1461FA600A0324842EEC5BFAF52028)
- The browser and the independent CLI verified the same operator-exported file against Diana after the batch-submitting session ended. The browser showed the pending 1 QOR withdrawal. Both paths rejected separate changes to the amount and recipient against Diana’s root. Claim and payout verification follow batch finality. [Operator-offline runbook](DIANA_RUN.md)
