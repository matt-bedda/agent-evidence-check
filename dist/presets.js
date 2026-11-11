/** "#1234" */
export const hashId = { name: "hashId", regex: /#(\d{3,5})\b/g, dedupe: false };
/** "ID 149", "ID164", "ID#167", "ID: 149" */
export const bareId = { name: "bareId", regex: /\bID\s*#?\s*(\d{2,6})\b/gi };
/** "Task 6403", "task #6403" (word spelled out) */
export const taskWordId = { name: "taskWordId", regex: /\btask\s*#?\s*(\d{3,5})\b/gi };
/** Named ID presets. Pass any subset via `options.idPatterns`. */
export const idPresets = { hashId, bareId, taskWordId };
/** Default: all three ID shapes (order matters only for the 10-ref cap). */
export const defaultIdPatterns = [hashId, bareId, taskWordId];
/** Nouns that make "N <noun>" count as a verifiable count. */
export const genericCountNouns = [
    "item", "record", "post", "message", "email", "commit", "file", "task",
    "ticket", "result", "entry", "row", "alert", "check", "run", "page",
    "error", "event", "match", "skip",
];
/** Extra nouns common in job/lead/pipeline style agents. */
export const pipelineCountNouns = ["application", "job", "lead", "candidate"];
/** Default noun list = generic + pipeline. */
export const defaultCountNouns = [...genericCountNouns, ...pipelineCountNouns];
/** Provider usage-cap messages: the agent never started, so there is no silent failure to flag. */
export const usageLimitExemption = {
    ref: "account-limit-cap",
    test: /you've hit your (session|weekly) limit/i,
};
