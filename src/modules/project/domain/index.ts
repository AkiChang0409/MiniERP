/**
 * Project domain layer — pure business rules / errors / event contracts, free
 * of route/DB wiring. Canonical home other layers import from (mirrors
 * `finance/domain`).
 */
export * from './errors';
export * from './events';
export * from './rules';
