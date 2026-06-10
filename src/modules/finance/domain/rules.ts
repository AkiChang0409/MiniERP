/**
 * Canonical domain-rules surface. New code should import finance business
 * rules from `domain/rules`.
 *
 * NOTE: the rule implementations currently still physically live under
 * `../rules/*` because they have cross-module deep importers
 * (`$modules/finance/rules`, routes, tests) + boundary-allowlist entries.
 * Relocating the files into `domain/` is a separate, cross-module commit
 * (update hr / routes / tests / allowlist). Until then this barrel is the
 * forward-facing import point.
 */
export * from '../rules/index';
