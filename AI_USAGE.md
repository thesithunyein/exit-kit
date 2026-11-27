# AI usage

The project owner selected the goal, product brief, references, and delivery requirements. Codex researched the protocol, implemented the recovery flow and operator commands, and exercised the checks below.

- The wallet integration review caught that QoreX expects protobuf bytes. The browser calls the same official registry used by the native RDK before handing the message to QoreX.
- The verifier tests a global withdrawal index greater than 32 bits against the official RDK tree. This catches accidental numeric bitwise truncation during proof verification.
- Tests replace the recipient and amount, cross the signed integer boundary, and supply a wrong-chain file. Run `npm test`.
- `node scripts/check-diana.mjs` re-reads the historical public transaction, rebuilds the signed receipt, validates the proof, and checks the indexed payout. It performs public reads only.

There are no AI decisions in the claim, verification, or signing paths. Human review and completion of the Exit Kit-owned withdrawal are tracked separately from these checks.
