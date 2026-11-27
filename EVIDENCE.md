# Verification

- `npm test` checks Qledger tree compatibility, tamper rejection, numeric boundaries, network binding, message construction, and the public-read proxy allowlist.
- `node scripts/check-diana.mjs` checks Vigil's historical Diana payout `258430D7FA0F4DB3CA8D2ABFF50C3247B1FF66058D02AFB293775ADDBD51A21C` (batch 18, withdrawal 4). The script reconstructs the recovery file from chain data, validates its signed receipt and proof, and matches the indexed payout. [Payout transaction](https://explore.qore.network/tx/258430D7FA0F4DB3CA8D2ABFF50C3247B1FF66058D02AFB293775ADDBD51A21C) · [Vigil evidence](https://github.com/Manuel-dev01/Vigil/blob/main/EVIDENCE.md)
- An Exit Kit-owned rollup and its operator-outage payout have not yet been verified on Diana. The historical transaction belongs to Vigil and is a read-only compatibility check.
