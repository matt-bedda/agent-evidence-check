/** An ID-style reference pattern. `regex` must have exactly one capture group (the id digits). */
export interface IdPattern {
  name: string;
  regex: RegExp;
  /** Skip refs already found (default true). hashId keeps duplicates for score parity. */
  dedupe?: boolean;
}

/** "#1234" */
export const hashId: IdPattern = { name: "hashId", regex: /#(\d{3,5})\b/g, dedupe: false };
/** "ID 149", "ID164", "ID#167", "ID: 149" */
export const bareId: IdPattern = { name: "bareId", regex: /\bID\s*#?\s*(\d{2,6})\b/gi };
/** "Task 6403", "task #6403" (word spelled out) */
export const taskWordId: IdPattern = { name: "taskWordId", regex: /\btask\s*#?\s*(\d{3,5})\b/gi };

/** Named ID presets. Pass any subset via `options.idPatterns`. */
export const idPresets = { hashId, bareId, taskWordId } as const;

/** Default: all three ID shapes (order matters only for the 10-ref cap). */
export const defaultIdPatterns: IdPattern[] = [hashId, bareId, taskWordId];

/** Nouns that make "N <noun>" count as a verifiable count. */
export const genericCountNouns: string[] = [
  "item", "record", "post", "message", "email", "commit", "file", "task",
  "ticket", "result", "entry", "row", "alert", "check", "run", "page",
  "error", "event", "match", "skip",
];

/** Extra nouns common in job/lead/pipeline style agents. */
export const pipelineCountNouns: string[] = ["application", "job", "lead", "candidate"];

/** Default noun list = generic + pipeline. */
export const defaultCountNouns: string[] = [...genericCountNouns, ...pipelineCountNouns];

/** A run result that should count as valid without further analysis. */
export interface Exemption {
  /** Becomes the single evidence ref, e.g. "account-limit-cap". */
  ref: string;
  /** RegExp or predicate over the full result text. */
  test: RegExp | ((text: string) => boolean);
}

/** Provider usage-cap messages: the agent never started, so there is no silent failure to flag. */
export const usageLimitExemption: Exemption = {
  ref: "account-limit-cap",
  test: /you've hit your (session|weekly) limit/i,
};
