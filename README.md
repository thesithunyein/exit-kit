<p align="center">
  <a href="https://exit-kit-alpha.vercel.app/"><img src="public/brand/exit-kit-192.png" width="96" height="96" alt="Exit Kit logo"></a>
</p>

<h1 align="center">Exit Kit</h1>

<p align="center"><strong>Recover a QoreChain rollup withdrawal from a file you keep.</strong></p>

<p align="center">
  <a href="https://exit-kit-alpha.vercel.app/"><img alt="Live web app" src="https://img.shields.io/badge/Web_app-Live-92d6d3?style=flat-square&amp;logo=vercel&amp;logoColor=white&amp;labelColor=161c20"></a>
  <a href="https://exit-kit-alpha.vercel.app/#guide"><img alt="Network: Diana testnet" src="https://img.shields.io/badge/Network-Diana_testnet-92d6d3?style=flat-square&amp;labelColor=161c20"></a>
  <a href="#quick-start"><img alt="Node.js 24" src="https://img.shields.io/badge/Node.js-24-92d6d3?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white&amp;labelColor=161c20"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-92d6d3?style=flat-square&amp;labelColor=161c20"></a>
</p>

<p align="center">
  <a href="https://exit-kit-alpha.vercel.app/#recover">Recover</a> ·
  <a href="https://exit-kit-alpha.vercel.app/#withdrawals">Find a withdrawal</a> ·
  <a href="#how-it-works">Architecture</a> ·
  <a href="EVIDENCE.md">Verification</a> ·
  <a href="SECURITY.md">Security</a>
</p>

## What is Exit Kit?

Exit Kit is an independent recovery tool for Qledger v1 withdrawals on QoreChain's Diana testnet. Open a recovery file to verify the amount, original recipient, and payout status. If the withdrawal is ready, submit the claim with QoreX or use the command-line signer against Diana directly.

## Verify a Diana withdrawal

Open the [public recovery file](https://raw.githubusercontent.com/thesithunyein/exit-kit/main/evidence/vigil-payout.json) in [Exit Kit](https://exit-kit-alpha.vercel.app/#recover). It should show **Already claimed** and **0.1 QOR**. This is a historical Vigil payout used to verify compatibility.

After `npm ci`, verify the same file directly against Diana from the repository root.

```sh
node scripts/claim.mjs evidence/vigil-payout.json
```

[Diana payout transaction](https://explore.qore.network/tx/258430D7FA0F4DB3CA8D2ABFF50C3247B1FF66058D02AFB293775ADDBD51A21C) · [Evidence and verification scope](EVIDENCE.md)

## The problem

A rollup's interface can go offline while a withdrawal is still waiting to be claimed. Users who saved a Merkle proof and signed settlement receipt can check that withdrawal independently as long as Diana retains the state required to execute it. A withdrawal that has yet to enter an executable batch still depends on rollup progress.

| What you have | Where to start |
| --- | --- |
| A recovery JSON file | Open it in [Recover](https://exit-kit-alpha.vercel.app/#recover). |
| The L1 hash of a completed payout | Open the receipt in [Withdrawals](https://exit-kit-alpha.vercel.app/#withdrawals). |
| Claim details and the Merkle proof for an unpaid withdrawal | Create a recovery file in [Withdrawals](https://exit-kit-alpha.vercel.app/#withdrawals). |
| A supported file and a local Diana signer | Use the [independent claim CLI](#independent-claim). |

## How it works

1. **Read the file on-device.** The browser validates the JSON format, supported network, amount, recipient, and proof fields.
2. **Verify against Diana.** Exit Kit recomputes the Qledger withdrawal leaf and its path to the on-chain root. The official RDK verifies the ML-DSA-87 settlement receipt for the same batch.
3. **Check whether it can be claimed.** A batch that is still finalizing shows as pending. After finality, the app checks for a matching indexed payout. Diana enforces single execution even if indexing is delayed.
4. **Approve a ready claim.** QoreX or the independent CLI signs and submits the native withdrawal transaction to Diana. The proof fixes the recipient and amount, and a separate account may pay the network fee.

~~~mermaid
flowchart TB
  subgraph Device["User device"]
    File["Recovery JSON<br/>Claim fields, Merkle proof, signed receipt"]
    Web["Browser verifier"]
    CLI["Independent CLI verifier"]
    Decision{"Verification and payout status"}
    Blocked["Invalid or unavailable<br/>Review the file or retry the read"]
    Pending["Waiting for batch finality"]
    Paid["Already claimed<br/>Display the payout transaction"]
    Ready["Ready to claim"]
    Wallet["QoreX approval"]
    Signer["Local Diana signer<br/>Explicit --broadcast"]
    File --> Web
    File --> CLI
    Web --> Decision
    CLI --> Decision
    Decision -->|Checks fail or required data is unavailable| Blocked
    Decision -->|Verified, awaiting finality| Pending
    Decision -->|Matching payout found| Paid
    Decision -->|Verified, finalized and no payout found| Ready
    Ready -->|Browser route| Wallet
    Ready -->|CLI route| Signer
  end

  Proxy["Exit Kit GET proxy<br/>Allowlisted public queries"]
  subgraph Diana["QoreChain Diana testnet"]
    State["Public REST<br/>Batch roots, receipt inputs and payout events"]
    Execute["Native withdrawal execution<br/>Proof-bound recipient and amount"]
  end

  Web <-->|Public chain queries and responses| Proxy
  Proxy <--> State
  CLI <-->|Direct public REST reads| State
  Wallet -->|Approved signed transaction| Execute
  Signer -->|Signed transaction| Execute
  Execute -->|Payout event| State
~~~

The browser sends public lookup parameters such as rollup and batch IDs or a payout hash through the proxy. The recovery file stays on-device. On approval, the signer submits the withdrawal transaction and its proof to Diana. The web verifier relies on public REST data for chain state. See the [threat model](THREAT_MODEL.md) for the trust assumptions and pruning limits.

## Quick start

Use Node.js 24.

~~~sh
git clone https://github.com/thesithunyein/exit-kit.git
cd exit-kit
npm ci
npm run dev
~~~

Open the local URL printed by Vite. The dev server mounts the same `/api/chain` handler deployed to Vercel. The production build goes to `dist/`.

| Command | Purpose |
| --- | --- |
| `npm test` | Check proof compatibility, input validation, transaction construction, and the proxy allowlist. |
| `npm run build` | Build the static frontend for production. |
| `node scripts/check-diana.mjs` | Reconstruct and verify Vigil's historical Diana payout using live chain data. |
| `node scripts/preflight.mjs <operator-qor1-address>` | Check the operator’s spendable test QOR and Diana’s live deployment requirements. |

## Recovery file format

Version 1 accepts up to 64 KB of JSON and binds the file to Qledger v1 on Diana.

| Field | Expected value |
| --- | --- |
| `format` | `exit-kit-recovery` |
| `version` | `1` |
| `chainId` | `qorechain-diana` |
| `rollupId` | Qledger rollup identifier |
| `batchIndex` | Decimal string within JavaScript's safe integer range |
| `withdrawalIndex` | Global Qledger withdrawal index as a uint64 decimal string |
| `recipient` | Canonical QoreChain Bech32 address |
| `denom` | `uqor` |
| `amount` | Positive int64 decimal string in uQOR |
| `proof` | Array of 32-byte siblings encoded as 64 hex characters each, in leaf-to-root order |
| `receipt` | [RDK v2 settlement receipt](https://docs.qorechain.io/rollups/settlement-receipts/) for the same batch |

The verifier uses the low bits of the global withdrawal index to determine where each sibling belongs in the Merkle path.

## Independent claim

Check a local file without a signer. If Diana has an indexed payout, the command prints its explorer link.

~~~sh
node scripts/claim.mjs path/to/file.recovery.json
~~~

For a ready claim, set `QORE_SIGNER_FILE` to the absolute path of a signer JSON outside this repository. The JSON needs one `mnemonic` property for a funded Diana-only account. Then run the command with `--broadcast` to submit the claim. Use this route if your QoreX build cannot display the RDK message.

~~~sh
node scripts/claim.mjs path/to/file.recovery.json --broadcast
~~~

## Rollup operations

Set `EXIT_KIT_ROLLUP` to choose a rollup ID. It defaults to `exit-kit-diana`. Signed operator actions use `QORE_SIGNER_FILE` and require Diana test QOR for the relevant stake, bond, deposits, and fees.

For the full payout and operator-offline verification sequence, see the [Diana runbook](DIANA_RUN.md).

| Step | Command | Purpose |
| --- | --- | --- |
| 1 | `node scripts/rollup.mjs create` | Register a based Qledger rollup. |
| 2 | `node scripts/rollup.mjs bond` | Bring the submitter bond up to the chain minimum. |
| 3 | `node scripts/rollup.mjs deposit 2000000` | Deposit 2 test QOR into the operator's L2 account. |
| 4 | `node scripts/rollup.mjs batch` | Publish a signed and anchored settlement batch. |
| 5 | `node scripts/rollup.mjs request-withdrawal 1000000 <qor1-recipient>` | Request a withdrawal of 1 test QOR, then run batch again to include it. |
| 6 | `node scripts/rollup.mjs export <batch> <global-index> <output.recovery.json>` | Replay the inbox, compare roots, and export the proof and signed receipt. |

Run `node scripts/rollup.mjs watch` to replay available batches and check signed anchors without a signer. Both watch and export require access to the relevant historical inbox data. For encrypted responder notes, the same CLI exposes `register-kem`, `seal-note`, and `open-note` through QoreSeal. These envelopes are separate from recovery files.

## Project structure

~~~text
exit-kit/
├── api/
│   └── chain.js                  Vercel API entry point
├── assets/
│   └── exit-kit-crystal-4k.mp4    Full-resolution brand animation
├── evidence/                     Public Diana verification artifacts
├── public/
│   ├── brand/                    App icons, chain mark, and web animation
│   ├── icons/                    Primer Octicons sprite and upstream license
│   └── manifest.webmanifest      App metadata
├── scripts/
│   ├── check-diana.mjs            Historical payout verification
│   ├── claim.mjs                  Independent verification and claim CLI
│   ├── preflight.mjs              Public Diana stake and balance checks
│   ├── responder-note.mjs         ML-KEM envelope helper
│   ├── rollup.mjs                 Rollup lifecycle, replay, exports, and notes
│   └── signer.mjs                 Local Diana signer and transaction checks
├── server/
│   └── chain.js                  Allowlisted Diana REST proxy
├── src/
│   ├── hero-motion.js             Hero playback and reduced-motion behavior
│   ├── main.js                    Browser routes, forms, and wallet handoff
│   ├── recovery-common.js         Shared recovery constants and formatting
│   ├── recovery.js                File validation, proof checks, and RDK calls
│   └── style.css                  Site styles
├── test/
│   ├── recovery.test.js           Recovery and proxy regression tests
│   └── responder-note.test.js     ML-KEM recipient and rollup binding tests
├── index.html                     Web application shell
├── package.json                   Commands and dependencies
├── package-lock.json              Dependency lockfile
├── vercel.json                    Deployment configuration and headers
├── vite.config.js                 Frontend build and local API middleware
├── .gitignore
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── THREAT_MODEL.md
├── EVIDENCE.md
├── DIANA_RUN.md
├── AI_USAGE.md
├── brand.md
└── LICENSE
~~~

## Verification and security

The browser and independent verifier have been checked against a historical payout from Vigil. The signerless watch also replayed finalized SkyProof batches on Diana. An Exit Kit-owned rollup and its operator-outage payout remain unverified. [Evidence and test details](EVIDENCE.md)

Recovery files contain payout metadata and should be shared only when necessary. Use the private contact in the security policy for vulnerability reports. [Security policy](SECURITY.md) · [Threat model](THREAT_MODEL.md)

## Contributing

Bug reports, documentation fixes, and pull requests are welcome. [Contributing guide](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

## License and credits

Exit Kit is released under the [MIT License](LICENSE). The bundled Primer Octicons have their own [MIT notice](public/icons/LICENSE). QoreChain's official RDK and QoreSeal provide the protocol and envelope primitives. [QoreChain RDK](https://github.com/qorechain/qorechain-rdk) · [AI usage](AI_USAGE.md)

Feasy, Webflow Altitude, and Dribbble's Payment Management UI with Timeline View informed the design. [Brand notes](brand.md) · [4K crystal animation](assets/exit-kit-crystal-4k.mp4)
