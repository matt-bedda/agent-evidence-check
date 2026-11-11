import { describe, it, expect } from "vitest";
import { checkEvidence, claimedOwnOutputPaths, hasCommitEvidence, usageLimitExemption, idPresets } from "../src/index.js";

describe("checkEvidence", () => {
  it("returns hasEvidence=false for empty string", () => {
    const r = checkEvidence("");
    expect(r.hasEvidence).toBe(false);
    expect(r.evidenceScore).toBe(0);
  });

  it("detects HEARTBEAT_OK as valid no-op evidence", () => {
    const r = checkEvidence("==SUMMARY== HEARTBEAT_OK — healthy, no action. ==END==");
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("HEARTBEAT_OK");
  });

  it("detects account usage-cap message as valid exempt evidence", () => {
    const r = checkEvidence("You've hit your weekly limit · resets Aug 10, 3am (UTC)", { exemptions: [usageLimitExemption] });
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("account-limit-cap");
  });

  it("detects session usage-cap message as valid exempt evidence", () => {
    const r = checkEvidence("You've hit your session limit · resets 2:20pm (UTC)", { exemptions: [usageLimitExemption] });
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("account-limit-cap");
  });

  it("detects commit SHAs", () => {
    const r = checkEvidence("Committed changes: a4f2c1b pushed to main.");
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs.some((ref) => ref.startsWith("sha:"))).toBe(true);
  });

  it("detects task IDs", () => {
    const r = checkEvidence("Completed task #4437 successfully.");
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("task:#4437");
  });

  it("detects counts with context", () => {
    const r = checkEvidence("Processed 5 applications and sent 2 emails.");
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs.some((ref) => ref.startsWith("count:"))).toBe(true);
  });

  it("detects URLs", () => {
    const r = checkEvidence("Checked https://example.com/status and it returned 200.");
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs.some((ref) => ref.startsWith("url:"))).toBe(true);
  });

  it("detects explicit zero-work markers as evidence", () => {
    const r = checkEvidence("No tasks found. Queue empty. Nothing to process.");
    expect(r.hasEvidence).toBe(true);
  });

  it("does NOT treat a bare zero failure count as a valid no-op", () => {
    // A pipeline agent that attempted work and failed, but the old
    // ZERO_WORK_RE matched the standalone "0"s and misjudged this as effective.
    const r = checkEvidence(
      "==SUMMARY==\nPipeline run: 8 found, 3 attempted, 0 submitted " +
        "(0 verified on-page, 3 failed, 0 skipped duplicates).\n==END==",
    );
    expect(r.hasEvidence).toBe(false);
  });

  it("detects counts with filler words between digit and noun", () => {
    // A sentinel agent that reports a script's literal stdout
    // ("sentinel: 0 new lead(s), 0 dedup skips"), which puts 1-2 filler words
    // between the digit and its noun. The old strict-adjacency regex scored
    // this zero refs across 3 consecutive genuinely-idle runs and falsely
    // escalated a working cron job as evidence-free.
    const r = checkEvidence(
      "Ran sentinel.py script which found 0 new Acme leads and " +
        "0 deduplication skips.",
    );
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("count:0 new Acme leads");
  });

  it("returns hasEvidence=false for pure narrative without refs", () => {
    const r = checkEvidence(
      "I reviewed the situation and everything looks fine. The system appears healthy.",
    );
    expect(r.hasEvidence).toBe(false);
    expect(r.noEvidenceReason).toBeTruthy();
  });

  it("detects bare relative file paths without a leading / or ./", () => {
    // A report that got misjudged evidence-free: agents in
    // this monorepo cite files as "convex/records.ts", not "./convex/records.ts", and
    // FILE_PATH_RE required that leading prefix. This run genuinely fixed the task and
    // named its files, but scored zero refs and helped trigger a false escalation.
    const r = checkEvidence(
      "1. **convex/records.ts** (92 lines) — Already implemented\n" +
        "2. **src/lib/useBinding.ts** — Fixed the empty channelId placeholder",
    );
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("path:convex/records.ts");
    expect(r.evidenceRefs).toContain("path:src/lib/useBinding.ts");
  });

  it("does not double-count a URL's path segment as a bare file path", () => {
    const r = checkEvidence("Checked https://example.com/assets/app.js and it returned 200.");
    expect(r.evidenceRefs.some((ref) => ref.startsWith("path:"))).toBe(false);
    expect(r.evidenceRefs.some((ref) => ref.startsWith("url:"))).toBe(true);
  });

  it("does not misread date/ratio slashes as bare file paths", () => {
    const r = checkEvidence("Ran 24/7, averaged 3/5.0, checked 08/08/2026 — no work found.");
    expect(r.evidenceRefs.some((ref) => ref.startsWith("path:"))).toBe(false);
  });

  it("detects action verbs with summary block as evidence", () => {
    const r = checkEvidence(
      "==SUMMARY==\nUpdated the configuration file and committed the changes.\n==END==",
    );
    expect(r.hasEvidence).toBe(true);
    expect(r.summary).toBeTruthy();
  });

  it("extracts summary block content", () => {
    const r = checkEvidence(
      "Some preamble.\n==SUMMARY==\nDid X, Y, Z. Commit a1b2c3d.\n==END==\nTrailing text.",
    );
    expect(r.summary).toBe("Did X, Y, Z. Commit a1b2c3d.");
    expect(r.evidenceRefs.some((ref) => ref.startsWith("sha:"))).toBe(true);
  });

  it("handles structured ==SUMMARY== with no refs — still false", () => {
    const r = checkEvidence(
      "==SUMMARY==\nI reviewed the system and things look okay.\n==END==",
    );
    expect(r.hasEvidence).toBe(false);
    expect(r.noEvidenceReason).toContain("no verifiable refs");
  });

  it("treats a quantified 'checked and nothing wrong' QA report as evidence", () => {
    // A functioning QA agent's correct output can be "nothing found" — the report
    // should not read as vague narrative just because it has no commits/file paths.
    const r = checkEvidence(
      "==SUMMARY==\n12/12 case-checks pass, zero pageerrors across all runs, no regressions found.\n==END==",
    );
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs.some((ref) => ref.startsWith("count:"))).toBe(true);
  });

  it("does not let an N/M fraction with N != M pass as a fraction-pass ref", () => {
    const r = checkEvidence("==SUMMARY==\n3/5 checks passing, 2 failing.\n==END==");
    expect(r.evidenceRefs.some((ref) => ref.startsWith("count:3/5"))).toBe(false);
  });

  it("detects bare ID references without a leading #", () => {
    // A content agent that submitted real posts but referenced them as "ID 149" rather
    // than "#149" must not be judged evidence-free.
    const r = checkEvidence(
      "==SUMMARY== Drafted 3-platform Vision set for Wed Aug 5: Twitter thread " +
        "(ID 149, 4 tweets all under 280 chars), Discord post (ID 147, discussion " +
        "seed in #general), Telegram post (ID 148, short mirror). ==END==",
    );
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("task:#149");
    expect(r.evidenceRefs).toContain("task:#147");
    expect(r.evidenceRefs).toContain("task:#148");
  });

  it("detects ID immediately followed by digits with no space (e.g. ID164)", () => {
    const r = checkEvidence("Submitted drafts ID164 (twitter), ID165 (discord), ID166 (telegram).");
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("task:#164");
  });

  it("falls back to the full result text when the ==SUMMARY== block is a malformed truncated duplicate", () => {
    // Example: the narrative body named a commit SHA,
    // a task ID, and a test tally, but the appended ==SUMMARY==/==END== block
    // was a mid-word-truncated copy of the last paragraph with none of that —
    // scanning the block alone scored zero refs and falsely flagged
    // genuinely-shipped runs as evidence-free.
    const r = checkEvidence(
      "## Summary\n\n" +
        "**Shipped:** Fixed a real detector bug in `lib/anomalies.js` (ticket #7537). " +
        "2 new regression tests, 307/307 pass. Committed `947f01647`, pushed.\n\n" +
        "**Biggest remaining gap:** none structural — all 7 build-order items are shipped.\n\n" +
        "==SUMMARY==\n" +
        "rned categorisation, funding runs) are shipped and green per COVERAGE.md.\n" +
        "==END==",
    );
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs.some((ref) => ref.startsWith("sha:947f01647"))).toBe(true);
    expect(r.evidenceRefs).toContain("task:#7537");
  });

  it("detects a bare 'Task N' reference with no leading #", () => {
    // A genuine investigation report ("no code changes needed") with zero
    // refs by the old patterns because it wrote "Task 6403", not "#6403".
    const r = checkEvidence(
      "Done. Task 6403 is complete with a written evaluation (no installs performed, " +
        "no code changes needed), and the outcome + the unverified-provenance flag " +
        "are logged in AGENTS.md for future runs.",
    );
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs).toContain("task:#6403");
  });

  it("detects label-first counts used by pipeline agents ", () => {
    // Pipeline agent output format: counts with labels before the colon,
    // e.g., "Jobs attempted: 8", "Applications submitted: 0", etc.
    const r = checkEvidence(
      "==SUMMARY==\n" +
        "**Pipeline Summary** - Jobs attempted: 8 - Resumes tailored: 0 - " +
        "Applications submitted: 0 (verified on-page) - Failed: 6 (all \"Job posting no longer available\") - Skipped: 2 (duplicates)\n" +
        "==END==",
    );
    expect(r.hasEvidence).toBe(true);
    expect(r.evidenceRefs.some((ref) => ref.startsWith("count:"))).toBe(true);
  });

  it("caps evidence refs at 10", () => {
    const lotsOfRefs = Array.from({ length: 20 }, (_, i) => `#${1000 + i}`).join(" ");
    const r = checkEvidence(lotsOfRefs);
    expect(r.evidenceRefs.length).toBeLessThanOrEqual(10);
  });
});

describe("claimed own-output paths", () => {
  it("extracts absolute paths on a line with a creation verb", () => {
    expect(claimedOwnOutputPaths("Wrote /tmp/evidence-missing-report.json with 12 rows.")).toEqual([
      "/tmp/evidence-missing-report.json",
    ]);
  });

  it("ignores read-only citations and URLs", () => {
    expect(
      claimedOwnOutputPaths("Read /etc/hosts for reference. See https://example.com/a/b.html for context."),
    ).toEqual([]);
  });

});


describe("hasCommitEvidence", () => {
  it("accepts git stdout, commit mentions and co-author trailers", () => {
    expect(hasCommitEvidence("[main 1a2b3c4] fix: thing")).toBe(true);
    expect(hasCommitEvidence("committed e473178 to main")).toBe(true);
    expect(hasCommitEvidence("Co-Authored-By: Someone <a@b.c>")).toBe(true);
  });
  it("rejects bare paths, counts and verbs", () => {
    expect(hasCommitEvidence("Updated src/a.ts, 12 tests pass, pushed nothing")).toBe(false);
    expect(hasCommitEvidence(null)).toBe(false);
  });
});

describe("options", () => {
  it("honours custom exemptions (regex and predicate)", () => {
    const text = "You've hit your weekly limit";
    expect(checkEvidence(text).hasEvidence).toBe(false);
    const r = checkEvidence(text, { exemptions: [usageLimitExemption] });
    expect(r.evidenceRefs).toEqual(["account-limit-cap"]);
    const r2 = checkEvidence("quota exhausted", { exemptions: [{ ref: "quota", test: (t) => t.includes("quota") }] });
    expect(r2.hasEvidence).toBe(true);
  });
  it("lets callers narrow ID presets", () => {
    expect(checkEvidence("Task 6403 ID 149", { idPatterns: [idPresets.hashId] }).evidenceRefs).not.toContain("task:#6403");
    expect(checkEvidence("Task 6403", { idPatterns: [idPresets.taskWordId] }).evidenceRefs).toContain("task:#6403");
  });
  it("lets callers supply count nouns", () => {
    expect(checkEvidence("7 widgets", { countNouns: ["widget"] }).evidenceRefs).toContain("count:7 widgets");
    expect(checkEvidence("7 widgets").hasEvidence).toBe(false);
  });
});
