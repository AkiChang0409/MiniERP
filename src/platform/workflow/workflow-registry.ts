import type { DBClient } from '$infrastructure/db';
import type { WorkflowStateRecord, WorkflowStatus } from './workflow-runtime';

/** Request-scoped runtime handed to step-input hooks that need to reach
 * platform/infrastructure or another module's public API (e.g. loading a
 * document's OCR text). Module-agnostic. */
export interface WorkflowRuntimeContext {
	env: Env;
	db: DBClient;
	user: App.Locals['user'];
}

/**
 * Generic workflow-definition registry. Modules own their workflow definitions
 * and register them here at bootstrap (the same inversion as the AI capability
 * registry). The engine looks definitions up by id and never imports modules,
 * so it stays module-agnostic and can graduate into a standalone workflow
 * service unchanged.
 */
export interface WorkflowStepDefinition {
	id: string;
	/** Capability ids this step runs (in order), executed via the registry. */
	capabilities: readonly string[];
	requiresUserConfirmation: boolean;
	nextSteps: readonly string[];
}

export interface ResolveStepInputArgs {
	state: WorkflowStateRecord;
	targetStep: string;
	payload: unknown;
	runtime: WorkflowRuntimeContext;
}

export interface ApplyStepResultArgs {
	state: WorkflowStateRecord;
	targetStep: string;
	payload: unknown;
	/** One entry per capability run for the step (in `capabilities` order). */
	outputs: unknown[];
}

export interface ApplyStepResult {
	dataPatch?: Record<string, unknown>;
	status?: WorkflowStatus;
}

export interface WorkflowDefinition {
	id: string;
	initialStep: string;
	steps: readonly WorkflowStepDefinition[];
	/**
	 * Domain hook: build the input handed to this step's capabilities from the
	 * accumulated state + incoming payload. Defaults to the raw payload.
	 * Lives with whoever registers the definition (module for single-domain,
	 * composition layer for cross-module) — the engine only calls it.
	 */
	resolveStepInput?: (args: ResolveStepInputArgs) => unknown | Promise<unknown>;
	/**
	 * Domain hook: fold the step's capability outputs (+ payload) into the
	 * workflow state, and optionally set a terminal status. Defaults to no patch.
	 */
	applyStepResult?: (args: ApplyStepResultArgs) => ApplyStepResult | Promise<ApplyStepResult>;
}

/**
 * Thrown by a definition's `resolveStepInput`/`applyStepResult` hook to reject
 * bad step input with a specific HTTP status (engine maps it to a failure
 * result). Lets domain hooks reproduce per-step 400 validation without the
 * engine knowing any domain rules.
 */
export class WorkflowStepError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'WorkflowStepError';
	}
}

const definitions = new Map<string, WorkflowDefinition>();

export function registerWorkflow(definition: WorkflowDefinition): void {
	definitions.set(definition.id, definition);
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
	return definitions.get(id);
}

export function listWorkflows(): WorkflowDefinition[] {
	return [...definitions.values()];
}

export function clearWorkflowRegistry(): void {
	definitions.clear();
}
