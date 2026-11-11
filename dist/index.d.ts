/**
 * agent-evidence-check: decide whether an LLM agent's final report contains verifiable
 * evidence of work (commit SHAs, file paths, ticket IDs, counts, URLs, structured summary
 * blocks) or is pure narrative that may be a false success.
 *
 * Pure functions, zero dependencies, no I/O.
 */
import { type Exemption, type IdPattern } from "./presets.js";
export * from "./presets.js";
export interface EvidenceReport {
    /** True if the run produced verifiable evidence of work (or is a valid no-op). */
    hasEvidence: boolean;
    /** 0.0-1.0 score. 0 = pure narrative, 1.0 = multiple specific refs. */
    evidenceScore: number;
    /** Specific refs found, prefixed by kind: sha:, path:, task:, url:, count:. */
    evidenceRefs: string[];
    /** Extracted ==SUMMARY== block content, or null if absent. */
    summary: string | null;
    /** Why the run is considered evidence-free (only set when hasEvidence=false). */
    noEvidenceReason?: string;
}
export interface CheckEvidenceOptions {
    /** ID-style reference patterns (default: hashId, taskWordId, bareId). */
    idPatterns?: IdPattern[];
    /** Nouns that make "N <noun>" a countable ref (default: defaultCountNouns). */
    countNouns?: string[];
    /** Texts that are valid without analysis (checked after the no-op marker). */
    exemptions?: Exemption[];
}
/**
 * Analyze an agent's final report for verifiable evidence of work done.
 * Pure narrative text (no specific refs) returns hasEvidence=false.
 */
export declare function checkEvidence(resultText: string, options?: CheckEvidenceOptions): EvidenceReport;
/** Absolute or ~/ paths the report claims it created. The caller decides how to stat them. */
export declare function claimedOwnOutputPaths(resultText: string): string[];
/** True if the text shows specific evidence that a commit actually landed. */
export declare function hasCommitEvidence(resultText: string | null | undefined): boolean;
