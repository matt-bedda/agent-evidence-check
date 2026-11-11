# agent-evidence-check

LLM agents have a habit of reporting success with nothing to show for it: "I looked into it and
everything seems fine", "the fix is in place", a confident paragraph with no commit, no file,
no ticket, no number. If you run agents unattended, those runs look identical to real work.

`agent-evidence-check` is a small, dependency-free, pure-function library that reads an agent's
final report and answers one question: **does this text contain verifiable evidence of work?**

It looks for commit SHAs, file paths, ticket/task IDs, URLs, counts ("12 records", "failed: 0",
"12/12 pass"), explicit no-op markers ("nothing to do", `HEARTBEAT_OK`), and structured
`==SUMMARY== ... ==END==` blocks. Pure narrative scores zero.

## Install

```bash
npm install agent-evidence-check
```

## Use

```js
import { checkEvidence } from "agent-evidence-check";

const good = checkEvidence("Fixed the retry bug. Committed a4f2c1b, 12/12 tests pass.");
// { hasEvidence: true, evidenceScore: 0.3, evidenceRefs: ["sha:a4f2c1b", "count:12/12 tests pass"], ... }

const bad = checkEvidence("I looked into the issue and everything seems to be working well now.");
// { hasEvidence: false, noEvidenceReason: "no verifiable refs, counts, or action verbs found", ... }
```

Run `node examples/basic.mjs` after `npm run build` for a runnable version.

### API

- `checkEvidence(text, options?)` returns `{ hasEvidence, evidenceScore (0-1), evidenceRefs, summary, noEvidenceReason? }`.
- `claimedOwnOutputPaths(text)` returns absolute / `~/` paths the report claims to have created, so
  you can stat them: a report that "wrote /out/report.json" when the file does not exist is a failure.
- `hasCommitEvidence(text)` is a narrower check (git commit stdout, "committed <sha>", a
  `Co-Authored-By:` trailer) for runs that were cut off mid-transcript and cite paths and verbs
  without ever landing a commit.

### Options and presets

Different teams reference work differently, so the heuristics that depend on conventions are
configurable:

```js
import { checkEvidence, idPresets, usageLimitExemption, defaultCountNouns } from "agent-evidence-check";

checkEvidence(text, {
  // ID shapes: hashId "#1234", taskWordId "Task 1234", bareId "ID 149" (default: all three)
  idPatterns: [idPresets.hashId],
  // nouns that make "N <noun>" a count (default: defaultCountNouns)
  countNouns: [...defaultCountNouns, "invoice"],
  // texts that are valid without analysis: provider usage-cap messages, revoked access, etc.
  exemptions: [usageLimitExemption, { ref: "quota", test: (t) => t.includes("quota exhausted") }],
});
```

## Design notes

- A bare "0" is never treated as a valid no-op: it also matches failure tallies such as
  "0 submitted (3 failed)". Only phrases that unambiguously mean "nothing to do" count.
- A matching fraction ("12/12 pass") counts as evidence; a mismatched one ("11/12") does not.
- If a `==SUMMARY==` block is malformed (for example a truncated duplicate of the last paragraph),
  the whole text is scanned before concluding the run has no evidence.
- Evidence refs are capped at 10.
- This is a heuristic filter, not a proof. It catches evidence-free narrative; it cannot tell a
  fabricated SHA from a real one. Pair it with a check against the real system (git, disk, your tracker).

## Development

```bash
npm install   # in a shell where NODE_ENV is not "production", or devDependencies are skipped
npm run typecheck && npm run build && npm test
```

`dist/` is committed so the package can be installed straight from a git tag
(`npm install git+ssh://git@github.com/<owner>/agent-evidence-check#v0.1.0`) without a build step.

## License

MIT
