/**
 * Entity resolution layer (design §9). The orchestrator must not let the LLM
 * guess *which* project/task/employee a request refers to. Resolvers are
 * registered by the app composition layer (they call module api facades through
 * a request-scoped ModuleContext); the platform stays module-agnostic.
 *
 * Resolution order per entity: route-context id (fast path) → registered
 * resolver candidates. Exactly one candidate ⇒ resolved; more than one ⇒
 * ambiguity (the orchestrator asks the user to choose); none ⇒ a missing slot.
 */
import type { ModuleContext } from '../../modules/types';
import type {
	InboundAgentMessage,
	OrchestratorCandidate,
	RouteContext,
	RuntimeContextEnvelope
} from './contracts';

export type EntityType =
	| 'project'
	| 'task'
	| 'employee'
	| 'supplier'
	| 'customer'
	| 'document';

export interface EntityCandidate extends OrchestratorCandidate {
	type: EntityType;
	reason?: string;
}

export interface ResolvedEntities {
	projectId?: string;
	taskId?: string;
	employeeId?: string;
	supplierId?: string;
	customerId?: string;
	documentId?: string;
}

export interface EntityResolutionResult {
	resolved: ResolvedEntities;
	candidates: EntityCandidate[];
	missingSlots: string[];
	ambiguity: boolean;
}

export interface EntityResolverInput {
	message: InboundAgentMessage;
	context: RuntimeContextEnvelope;
	want: readonly EntityType[];
	/** Request-scoped module context so resolvers can call module api facades. */
	moduleContext?: ModuleContext;
}

export interface EntityResolver {
	type: EntityType;
	resolve(input: EntityResolverInput): Promise<EntityCandidate[]> | EntityCandidate[];
}

const resolvers = new Map<EntityType, EntityResolver>();

export function registerEntityResolver(resolver: EntityResolver): void {
	resolvers.set(resolver.type, resolver);
}

export function lookupEntityResolver(type: EntityType): EntityResolver | undefined {
	return resolvers.get(type);
}

export function clearEntityResolvers(): void {
	resolvers.clear();
}

const SLOT: Record<EntityType, keyof ResolvedEntities> = {
	project: 'projectId',
	task: 'taskId',
	employee: 'employeeId',
	supplier: 'supplierId',
	customer: 'customerId',
	document: 'documentId'
};

function routeContextId(type: EntityType, rc?: RouteContext): string | undefined {
	if (!rc) return undefined;
	switch (type) {
		case 'project':
			return rc.projectId;
		case 'task':
			return rc.taskId;
		case 'document':
			return rc.documentId;
		default:
			return undefined;
	}
}

export async function resolveEntities(
	input: EntityResolverInput
): Promise<EntityResolutionResult> {
	const resolved: ResolvedEntities = {};
	const candidates: EntityCandidate[] = [];
	const missingSlots: string[] = [];
	let ambiguity = false;

	for (const type of input.want) {
		const fromRoute = routeContextId(type, input.context.routeContext);
		if (fromRoute) {
			resolved[SLOT[type]] = fromRoute;
			continue;
		}

		const resolver = lookupEntityResolver(type);
		if (!resolver) {
			missingSlots.push(SLOT[type]);
			continue;
		}

		const found = (await resolver.resolve(input)).filter((c) => c.type === type);
		candidates.push(...found);
		if (found.length === 1) {
			resolved[SLOT[type]] = found[0].id;
		} else if (found.length > 1) {
			ambiguity = true;
		} else {
			missingSlots.push(SLOT[type]);
		}
	}

	return { resolved, candidates, missingSlots, ambiguity };
}
