/**
 * agent-evidence-check: decide whether an LLM agent's final report contains verifiable
 * evidence of work (commit SHAs, file paths, ticket IDs, counts, URLs, structured summary
 * blocks) or is pure narrative that may be a false success.
 *
 * Pure functions, zero dependencies, no I/O.
 */
import { defaultCountNouns, defaultIdPatterns, } from "./presets.js";
export * from "./presets.js";
const NOOP_MARKER_RE = /HEARTBEAT_OK/;
const SUMMARY_BLOCK_RE = /==SUMMARY==([\s\S]*?)==END==/;
const COMMIT_SHA_RE = /\b[0-9a-f]{7,40}\b/gi;
const FILE_PATH_RE = /(?:^|\s)((?:\/|\.\/|~\/)[^\s,;()'"]+\.[a-zA-Z]{1,10})/gm;
// Bare relative paths ("src/lib/foo.ts") with no leading "/", "./" or "~/". Run against
// text with URLs stripped so URL path segments are not double-counted.
const BARE_FILE_PATH_RE = /\b([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z]{1,10})\b/g;
const URL_RE = /https?:\/\/[^\s)'"]+/g;
// "0 new leads", "12 records": up to 2 filler words between the number and the noun.
function countWithContextRe(nouns) {
    const alt = nouns.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    return new RegExp(`\\b(\\d+)(?:\\s+[a-zA-Z]+){0,2}\\s+(?:${alt})s?\\b`, "gi");
}
// "Jobs attempted: 8", "Applications submitted: 0"
const LABEL_FIRST_COUNT_RE = /\b(?:job|application|resume|email|post|message|file|commit|task|record|attempt|failure|skip|run|check|result|total)s?\s+(?:attempted|processed|submitted|sent|posted|published|created|updated|deleted|scanned|found|checked|verified|failed|skipped|tailored|written|drafted|applied|generated|saved)\s*:?\s*(\d+)\b/gi;
// "attempted: 3", "failed: 0"
const SIMPLE_LABEL_COUNT_RE = /\b(?:attempted|processed|submitted|sent|posted|published|created|updated|deleted|verified|failed|skipped|found|checked|attempted)\s*:?\s*(\d+)\b/gi;
// "Total blog posts: 452", "Total: 10"
const TOTAL_COUNT_RE = /\b(?:total|summary|count|created|published|generated|processed|submitted)\s*:?\s*(\d+)\b/gi;
// Phrases that unambiguously mean "nothing to do". A bare "0" or "zero" is deliberately NOT
// here: it would also match failure tallies like "0 submitted (3 failed)".
const ZERO_WORK_RE = /\b(?:no new|nothing new|no tasks|queue empty|no work|no items|no messages|no errors|no regressions|no issues found|no failures|all clear|nothing to do|HEARTBEAT_OK)\b/i;
const ACTION_VERB_RE = /\b(?:committed|pushed|created|updated|deleted|sent|filed|posted|published|applied|processed|completed|inserted|upserted|merged|approved|rejected|escalated|flagged|disabled|enabled|generated|shipped)\b/i;
// "12/12 pass": matching numerator/denominator is an all-passed signal that cannot hide a
// nonzero failure count the way a bare "0" can.
const FRACTION_PASS_RE = /\b(\d+)\/\1\b[^.]{0,30}\b(?:pass|passing|passed|ok)\b/i;
const MAX_REFS = 10;
function scanText(searchText, opts) {
    const refs = [];
    let m;
    const commitRe = new RegExp(COMMIT_SHA_RE.source, "gi");
    while ((m = commitRe.exec(searchText)) !== null) {
        refs.push(`sha:${m[0]}`);
        if (refs.length >= MAX_REFS)
            break;
    }
    const fileRe = new RegExp(FILE_PATH_RE.source, "gm");
    while ((m = fileRe.exec(searchText)) !== null) {
        const path = m[1].trim();
        if (path.length > 3 && !refs.includes(`path:${path}`))
            refs.push(`path:${path}`);
        if (refs.length >= MAX_REFS)
            break;
    }
    const bareText = searchText.replace(new RegExp(URL_RE.source, "g"), " ");
    const barePathRe = new RegExp(BARE_FILE_PATH_RE.source, "g");
    while ((m = barePathRe.exec(bareText)) !== null) {
        const path = m[1].trim();
        if (path.length > 3 && !refs.includes(`path:${path}`))
            refs.push(`path:${path}`);
        if (refs.length >= MAX_REFS)
            break;
    }
    // ID-style refs. All patterns collapse to "task:#<digits>" and are de-duplicated.
    for (const p of opts.idPatterns) {
        const re = new RegExp(p.regex.source, p.regex.flags.includes("g") ? p.regex.flags : p.regex.flags + "g");
        while ((m = re.exec(searchText)) !== null) {
            const ref = `task:#${m[1]}`;
            if (p.dedupe === false || !refs.includes(ref))
                refs.push(ref);
            if (refs.length >= MAX_REFS)
                break;
        }
    }
    const urlRe = new RegExp(URL_RE.source, "g");
    while ((m = urlRe.exec(searchText)) !== null) {
        refs.push(`url:${m[0].slice(0, 80)}`);
        if (refs.length >= MAX_REFS)
            break;
    }
    const countsSeen = new Set();
    const countRes = [
        countWithContextRe(opts.countNouns),
        new RegExp(LABEL_FIRST_COUNT_RE.source, "gi"),
        new RegExp(SIMPLE_LABEL_COUNT_RE.source, "gi"),
        new RegExp(TOTAL_COUNT_RE.source, "gi"),
    ];
    for (const re of countRes) {
        while ((m = re.exec(searchText)) !== null) {
            const countRef = `count:${m[0].trim()}`;
            if (!countsSeen.has(countRef)) {
                refs.push(countRef);
                countsSeen.add(countRef);
            }
            if (refs.length >= MAX_REFS)
                break;
        }
    }
    const hasZeroWorkMarker = ZERO_WORK_RE.test(searchText);
    const fractionPassMatch = FRACTION_PASS_RE.exec(searchText);
    if (fractionPassMatch)
        refs.push(`count:${fractionPassMatch[0].trim()}`);
    const hasActionVerb = ACTION_VERB_RE.test(searchText);
    return { refs, hasZeroWorkMarker, hasActionVerb };
}
function scoreScan(scan, hasSummaryBlock) {
    let score = 0;
    if (scan.refs.length > 0)
        score += Math.min(0.6, scan.refs.length * 0.15);
    if (scan.hasZeroWorkMarker)
        score += 0.3;
    if (scan.hasActionVerb && scan.refs.length === 0)
        score += 0.2;
    if (hasSummaryBlock)
        score += 0.2;
    return Math.min(1.0, score);
}
function scanHasEvidence(scan, hasSummaryBlock) {
    return scan.refs.length > 0 || scan.hasZeroWorkMarker || (scan.hasActionVerb && hasSummaryBlock);
}
/**
 * Analyze an agent's final report for verifiable evidence of work done.
 * Pure narrative text (no specific refs) returns hasEvidence=false.
 */
export function checkEvidence(resultText, options = {}) {
    const opts = {
        idPatterns: options.idPatterns ?? defaultIdPatterns,
        countNouns: options.countNouns ?? defaultCountNouns,
    };
    if (!resultText || resultText.trim().length === 0) {
        return { hasEvidence: false, evidenceScore: 0, evidenceRefs: [], summary: null, noEvidenceReason: "empty result" };
    }
    if (NOOP_MARKER_RE.test(resultText)) {
        return { hasEvidence: true, evidenceScore: 1.0, evidenceRefs: ["HEARTBEAT_OK"], summary: "HEARTBEAT_OK" };
    }
    for (const ex of options.exemptions ?? []) {
        const hit = typeof ex.test === "function" ? ex.test(resultText) : new RegExp(ex.test.source, ex.test.flags.replace(/[gy]/g, "")).test(resultText);
        if (hit) {
            return { hasEvidence: true, evidenceScore: 1.0, evidenceRefs: [ex.ref], summary: resultText.trim() };
        }
    }
    const summaryMatch = SUMMARY_BLOCK_RE.exec(resultText);
    const summary = summaryMatch ? summaryMatch[1].trim() : null;
    const hasSummaryBlock = summary !== null;
    // Prefer the summary block (more signal-dense).
    let scan = scanText(summary ?? resultText, opts);
    let hasEvidence = scanHasEvidence(scan, hasSummaryBlock);
    // A summary block can itself be malformed (e.g. a truncated duplicate of the last
    // paragraph). If the block alone shows no evidence, or only an action verb, fall back to
    // scanning the whole text before concluding the run is evidence-free.
    const summaryHasOnlyActionVerb = scan.hasActionVerb && scan.refs.length === 0 && !scan.hasZeroWorkMarker;
    if ((!hasEvidence || summaryHasOnlyActionVerb) && summary !== null && summary !== resultText) {
        const fullScan = scanText(resultText, opts);
        if (scanHasEvidence(fullScan, hasSummaryBlock)) {
            scan = fullScan;
            hasEvidence = true;
        }
    }
    const score = scoreScan(scan, hasSummaryBlock);
    if (!hasEvidence) {
        return {
            hasEvidence: false,
            evidenceScore: score,
            evidenceRefs: scan.refs,
            summary,
            noEvidenceReason: hasSummaryBlock
                ? "summary block present but no verifiable refs or action verbs"
                : "no verifiable refs, counts, or action verbs found",
        };
    }
    return { hasEvidence: true, evidenceScore: score, evidenceRefs: scan.refs, summary };
}
// Own-output claims: a report that names an artifact it created is checkable against disk by
// the caller. "Claimed as own output" is decided narrowly: an absolute or ~/ path on a line
// that also uses a creation verb. Relative paths are never returned (no reliable base dir).
const ABSOLUTE_PATH_TOKEN_RE = /(?:^|[\s`'"(])((?:\/|~\/)[^\s`'"),;:]+\.[a-zA-Z0-9]{1,10})\b/g;
const CREATION_CLAIM_RE = /\b(?:created|wrote|written|saved|generated|produced|exported|output|artifact)\b/i;
/** Absolute or ~/ paths the report claims it created. The caller decides how to stat them. */
export function claimedOwnOutputPaths(resultText) {
    const paths = [];
    for (const line of resultText.split("\n")) {
        // Verb test runs on prose only: "/tmp/report-written.json" is not a creation claim.
        const prose = line.replace(new RegExp(ABSOLUTE_PATH_TOKEN_RE.source, "g"), " ");
        if (!CREATION_CLAIM_RE.test(prose))
            continue;
        const pathRe = new RegExp(ABSOLUTE_PATH_TOKEN_RE.source, "g");
        let m;
        while ((m = pathRe.exec(line)) !== null)
            paths.push(m[1]);
    }
    return paths;
}
// Narrower than checkEvidence(): git commit stdout ("[main 1a2b3c4] msg"), an explicit
// "committed <sha>" mention, or an AI co-author trailer that only appears in a real commit.
// Useful for runs cut off mid-transcript, where paths/counts/verbs appear without any commit.
const GIT_COMMIT_STDOUT_RE = /\[[\w./-]+\s+[0-9a-f]{7,40}\]/;
const COMMIT_MENTION_RE = /\bcommit(?:ted)?\b[^\n]{0,30}\b[0-9a-f]{7,40}\b/i;
const COAUTHORED_BY_RE = /Co-Authored-By:/i;
/** True if the text shows specific evidence that a commit actually landed. */
export function hasCommitEvidence(resultText) {
    if (!resultText)
        return false;
    return GIT_COMMIT_STDOUT_RE.test(resultText) || COMMIT_MENTION_RE.test(resultText) || COAUTHORED_BY_RE.test(resultText);
}
