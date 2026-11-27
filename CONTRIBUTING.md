# Contributing

## Report a bug

Open a [GitHub issue](https://github.com/thesithunyein/exit-kit/issues) with the affected route or command, browser or Node version, expected behavior, and what happened. Use public Diana transaction IDs or sanitized fixtures where they help explain the issue. Report vulnerabilities through the [security policy](SECURITY.md).

## Develop locally

Use Node.js 24.

```sh
npm ci
npm run dev
npm test
npm run build
```

For changes involving public chain reads, `node scripts/check-diana.mjs` verifies a historical payout without a signer. To check UI behavior, use Recover, Withdrawals, Guide, or Operator in the local site and test the affected flow at both desktop and mobile widths.

## Open a pull request

Describe the user-facing change, how you verified it, and any effect on recovery-file compatibility, privacy, or signing. Include a screenshot for visible UI changes when it helps reviewers. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
