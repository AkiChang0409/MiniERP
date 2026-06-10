/**
 * Finance domain layer — pure business rules / types / events, free of
 * route/DB wiring. This is the canonical home other layers import from.
 *
 * Present: errors (failure taxonomy), events (domain event contracts),
 * rules (barrel; physical move deferred — see rules.ts).
 * Deferred: entities.ts / types.ts consolidation (domain row + value types are
 * still spread across schemas/ and service files).
 */
export * from './errors';
export * from './events';
export * from './rules';
