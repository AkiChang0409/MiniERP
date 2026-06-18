/**
 * Domain agent registry. Modeled on `capability-registry.ts`: domain agent
 * plugins register at app startup (composition root) and the orchestrator looks
 * them up by id / domain. Platform never imports the modules directly.
 */
import type { DomainAgentPlugin } from './contracts';

const agents = new Map<string, DomainAgentPlugin>();

export function registerAgent(plugin: DomainAgentPlugin): void {
	const id = plugin.manifest.id;
	if (agents.has(id)) {
		throw new Error(`Agent already registered: ${id}`);
	}
	agents.set(id, plugin);
}

export function lookupAgent(agentId: string): DomainAgentPlugin | undefined {
	return agents.get(agentId);
}

export function listAgents(): DomainAgentPlugin[] {
	return [...agents.values()];
}

export function findAgentsByDomain(domain: string): DomainAgentPlugin[] {
	return [...agents.values()].filter((a) => a.manifest.domain === domain);
}

export function clearAgentRegistry(): void {
	agents.clear();
}
