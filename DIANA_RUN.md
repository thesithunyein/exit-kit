# Diana operator-offline recovery run

This runbook is for the project-owned `exit-kit-diana` rollup. See [current evidence](EVIDENCE.md) for what has been executed so far.

## Fund and provision

Use a funded Diana-only test signer whose file is stored outside the repository. Query spendable QOR and the live stake and bond requirements before submitting anything. Keep enough test QOR for the deposit and network fees as well.

```sh
node scripts/preflight.mjs <operator-qor1-address> exit-kit-diana
node scripts/rollup.mjs create
node scripts/rollup.mjs bond
```

Set `QORE_SIGNER_FILE` to the operator’s local signer file and `EXIT_KIT_ROLLUP` to `exit-kit-diana` before the signed commands. Record the rollup creation and bond transaction hashes. Confirm that the rollup has a layer before batching because the layer is required for signed anchors. [QoreChain deployment requirements](https://docs.qorechain.io/rollups/deploying-a-rollup/)

## Produce a portable recovery file

```sh
node scripts/rollup.mjs deposit 2000000
node scripts/rollup.mjs batch
node scripts/rollup.mjs request-withdrawal 1000000 <payout-qor1-address>
node scripts/rollup.mjs batch
node scripts/rollup.mjs export <batch-index> <global-withdrawal-index> exit-kit-payout.recovery.json
node scripts/rollup.mjs watch
```

Keep the withdrawal batch hash, receipt anchor height, replayed withdrawal root, and exported file. Wait for the batch to finalize on Diana.

## Verify and claim with the operator offline

Stop any operator UI, API, and batch runner participating in the run. If batching is manual, exit that operator session and record that no operator process is running. Leave the registered rollup active on Diana so the chain can execute its finalized batch.

1. Open the same file in the hosted app and in the read-only CLI below. Verify that the recipient and amount agree and the withdrawal is ready.
2. In separate copies, change the amount and the recipient to another valid Diana address. Confirm each copy is rejected before signing.
3. Use QoreX or the CLI with a funded Diana signer to submit the original claim once. Save the explorer hash and reopen the file in the app to confirm **Already claimed**.

```sh
node scripts/claim.mjs exit-kit-payout.recovery.json
node scripts/claim.mjs exit-kit-payout.recovery.json --broadcast
node scripts/check-diana.mjs <payout-hash>
```

## Verify the encrypted handoff

Register the handoff recipient’s ML-KEM key on Diana using their funded local signer. Seal an operator note that references the public withdrawal ID and open it locally as the registered recipient. Keep the file and seed private. Record the public registration hash and compare the original and decrypted note locally.

```sh
node scripts/rollup.mjs register-kem
node scripts/rollup.mjs seal-note <recipient-qor1-address> handoff.txt handoff.sealed
node scripts/rollup.mjs open-note handoff.sealed handoff-opened.txt
```

Publish the verified public payout file, explorer hashes, watchtower output, and a short recording of the real recovery. Keep the recording under the event’s three-minute limit. [Submission rules](https://build.qorechain.io/rules)
