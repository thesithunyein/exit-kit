# Security policy

## Supported scope

The maintained version is the code on `main` and the [live Exit Kit instance](https://exit-kit-alpha.vercel.app/). Reports about browser file handling, proof or receipt verification, the Diana read proxy, and the local signing and withdrawal flows are in scope. Exit Kit supports Diana testnet and Qledger v1 withdrawals.

## Report a vulnerability

Email the [maintainer](mailto:sithunyein.mailto@gmail.com?subject=Exit%20Kit%20security%20report) privately. Include the affected component and version or commit, the observed behavior, and its potential impact. Remove wallet secrets, recovery phrases, signer files, and personal data from any attachments.

Keep the details private while the report is being assessed and a fix is coordinated. Use [GitHub Issues](https://github.com/thesithunyein/exit-kit/issues) for ordinary bugs and feature requests.

## Security design

- The browser reads recovery files locally. The web proxy accepts only an allowlist of public Diana GET queries.
- The proof binds the withdrawal to its original recipient and amount. Diana enforces single execution.
- QoreX and the independent CLI handle signing in their own environments. Keep Diana signer files outside the repository.
- Verification depends on the availability of the required chain data. See the [threat model](THREAT_MODEL.md) and [verification evidence](EVIDENCE.md).
