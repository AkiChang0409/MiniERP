/**
 * Finance integrations barrel — cross-module / external dependency seam.
 * `contracts.ts` = the ports (+ outbound registry declaration),
 * `local-adapters.ts` = current monolith impls, `http-adapters.ts` = future
 * microservice impls.
 */
export * from './contracts';
export * from './local-adapters';
export * from './http-adapters';
