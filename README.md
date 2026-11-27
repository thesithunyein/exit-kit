<img src="public/brand/exit-kit-192.png" width="96" height="96" alt="Exit Kit logo">

# Exit Kit

[4K crystal animation](assets/exit-kit-crystal-4k.mp4)

Recover a QoreChain Diana rollup withdrawal from a file you keep. Open the file, check the amount and original destination, and send the claim directly to QoreChain after settlement.

The browser reads recovery files locally. The web deployment proxies a narrow set of public Diana reads because the public REST node does not allow cross-origin requests. The independent CLI reads Diana directly and does not require the web app, operator API, or indexer.

For a lost file, open **Withdrawals**. A paid withdrawal can be found using its Diana L1 transaction hash. To create a file for an unpaid withdrawal, use the claim details and Merkle proof supplied by the rollup.

## Start

Use Node 24 and run `npm ci`, then `npm run dev`. Use `npm test` for the proof and format checks and `npm run build` for the website build. Vercel serves the static build and `api/chain.js`.

## Recovery file v1

This JSON format supports Qledger v1 withdrawals on `qorechain-diana`. The maximum file size is 64 KB.

| Field | Value |
| --- | --- |
| `format` | `exit-kit-recovery` |
| `version` | `1` |
| `chainId` | `qorechain-diana` |
| `rollupId` | Qledger rollup identifier |
| `batchIndex` | Decimal string for an integer no greater than JavaScript's maximum safe integer |
| `withdrawalIndex` | Global Qledger withdrawal index as a uint64 decimal string |
| `recipient` | Canonical QoreChain Bech32 address |
| `denom` | `uqor` |
| `amount` | Positive int64 decimal string in uQOR |
| `proof` | Sibling hashes in leaf-to-root order, each 32 bytes expressed as 64 hex characters |
| `receipt` | The [RDK v2 settlement receipt](https://docs.qorechain.io/rollups/settlement-receipts/) for the same batch |

The verifier recomputes the Qledger leaf and walks the sibling path using the low bits of the global index to select the side at each level. It compares the result with Diana's withdrawal root and verifies the ML-DSA-87 receipt through the official RDK. A claim can only execute after finality and while QoreChain retains the relevant state. The payout event index is useful for status, while the chain enforces the single payout.

## Independent claim

`node scripts/claim.mjs path/to/file.recovery.json` checks the claim and prints any confirmed payout transaction.

To pay the submission fee with a funded, throwaway **Diana** signer, point `QORE_SIGNER_FILE` to a file outside this repository containing a single `mnemonic` property. Then run `node scripts/claim.mjs path/to/file.recovery.json --broadcast`. The original recipient is fixed by the proof, even if the fee payer is another address. The signer stays local.

The browser also implements QoreX native approval. Wallet builds that refuse the RDK message can use the independent CLI. The source for the web signer and CLI both uses QoreChain's official RDK registry and message builder.

## Rollup operations

Set `QORE_SIGNER_FILE` and optionally `EXIT_KIT_ROLLUP` (default `exit-kit-diana`). An operator needs Diana test QOR for the creation stake, layer registration, submitter bond, and fees.

Run these on Diana, one at a time:

1. `node scripts/rollup.mjs create` registers the based Qledger rollup.
2. `node scripts/rollup.mjs bond` brings the submitter bond up to the actual chain minimum.
3. `node scripts/rollup.mjs deposit 2000000` deposits 2 test QOR to the operator's L2 account.
4. `node scripts/rollup.mjs batch` publishes a signed and anchored settlement batch.
5. `node scripts/rollup.mjs request-withdrawal 1000000 <qor1-recipient>` posts a signed L2 withdrawal. Run `batch` again to include it.
6. `node scripts/rollup.mjs export <batch> <global-index> <output.recovery.json>` replays the inbox, checks the withdrawal root, and saves the proof and signed receipt. The withdrawal becomes payable after finality.
7. `node scripts/rollup.mjs watch` replays currently available batches and verifies their signed anchors using a read-only signerless process. Run on a scheduler and alert on nonzero exit. A node with the required historical inbox data is necessary for this full replay.

For responder notes, use `register-kem` to publish a fresh Diana account's KEM key. `seal-note <qor1-recipient> <input-file> <output-file>` checks the registry key and seals a note using ML-KEM-1024. `open-note <input-file> <output-file>` uses the recipient's local signer file. The sealed note is a separate file from the withdrawal proof.

See [evidence](EVIDENCE.md), [threat model](THREAT_MODEL.md), and [AI usage](AI_USAGE.md). QoreChain RDK and QoreSeal are the official upstream libraries. Feasy, Webflow Altitude, and Dribbble's Payment Management UI with Timeline View informed the design.
