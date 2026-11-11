/** An ID-style reference pattern. `regex` must have exactly one capture group (the id digits). */
export interface IdPattern {
    name: string;
    regex: RegExp;
    /** Skip refs already found (default true). hashId keeps duplicates for score parity. */
    dedupe?: boolean;
}
/** "#1234" */
export declare const hashId: IdPattern;
/** "ID 149", "ID164", "ID#167", "ID: 149" */
export declare const bareId: IdPattern;
/** "Task 6403", "task #6403" (word spelled out) */
export declare const taskWordId: IdPattern;
/** Named ID presets. Pass any subset via `options.idPatterns`. */
export declare const idPresets: {
    readonly hashId: IdPattern;
    readonly bareId: IdPattern;
    readonly taskWordId: IdPattern;
};
/** Default: all three ID shapes (order matters only for the 10-ref cap). */
export declare const defaultIdPatterns: IdPattern[];
/** Nouns that make "N <noun>" count as a verifiable count. */
export declare const genericCountNouns: string[];
/** Extra nouns common in job/lead/pipeline style agents. */
export declare const pipelineCountNouns: string[];
/** Default noun list = generic + pipeline. */
export declare const defaultCountNouns: string[];
/** A run result that should count as valid without further analysis. */
export interface Exemption {
    /** Becomes the single evidence ref, e.g. "account-limit-cap". */
    ref: string;
    /** RegExp or predicate over the full result text. */
    test: RegExp | ((text: string) => boolean);
}
/** Provider usage-cap messages: the agent never started, so there is no silent failure to flag. */
export declare const usageLimitExemption: Exemption;
