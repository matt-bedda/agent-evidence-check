import { checkEvidence } from "../dist/index.js";

const good = checkEvidence("Fixed the retry bug. Committed a4f2c1b, 12/12 tests pass. See https://example.com/pr/42");
const bad = checkEvidence("I looked into the issue and everything seems to be working well now.");

console.log("good:", good.hasEvidence, good.evidenceRefs);
console.log("bad: ", bad.hasEvidence, bad.noEvidenceReason);
