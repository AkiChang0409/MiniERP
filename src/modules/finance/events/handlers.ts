import type { EventBus, ModuleContext } from '$platform/modules/types';

/**
 * Inbound event handlers — how finance reacts to OTHER modules' domain events.
 *
 * Finance is currently publish-only (see `publishers.ts`); it does not yet
 * subscribe to cross-module events. This seam exists so subscriptions land in
 * one place and `module.ts` can wire `registerHandlers` the same way every
 * standard module does. Add `bus.on('<other>.<verb>', ...)` listeners here as
 * cross-module reactions are introduced (e.g. recompute summaries on
 * `project.archived`).
 */
export function registerFinanceHandlers(_bus: EventBus, _ctx: ModuleContext): void {
	// no inbound subscriptions yet
}
