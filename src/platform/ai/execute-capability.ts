/**
 * Unified guarded capability executor (Phase 0 base architecture).
 *
 * This is the single sanctioned path for invoking an AI capability. It codifies
 * the capability execution spec so no caller can skip a step:
 *
 *   1. ALWAYS run `checkToolPolicy` before dispatch. A denied decision never
 *      reaches `execute()`.
 *   2. Validate input against `manifest.inputSchema` when present (the contract
 *      for LLM function-calling / Lark argument validation).
 *   3. Dispatch via `executeCapability` (registry-level enabled check).
 *   4. Validate output against `manifest.outputSchema` when present.
 *   5. ALWAYS write an `appendAgentAuditEntry` — for denied, invalid, failed,
 *      and ok outcomes alike.
 *
 * Combined with the registration invariant (a `'write'` capability must set
 * `requiresConfirmation: true`) and tool-policy's `confirmation_missing` block,
 * this guarantees a write capability invoked without a `confirmationRef` is
 * denied before any side effect.
 *
 * Note on layering: capabilities themselves should call their owning module's
 * public API facade (e.g. `createLeaveApi(ctx)`), never `new Service()` or the
 * repository/db directly. This executor does not enforce that (it cannot see
 * inside `execute`), but it is the documented contract for Phase 1 capabilities.
 */
import type { DBClient } from '../../infrastructure/db';
import type { AuthRole } from '../auth/config';
import { appendAgentAuditEntry } from '../audit/audit-log';
import {
	executeCapability,
	lookupCapability,
	type PlatformCapabilityContext
} from './capability-registry';
import { checkToolPolicy, type PolicyDecision } from './tool-policy';

export interface GuardedCapabilityActor {
	userId?: string | null;
	userEmail?: string | null;
	roles: AuthRole[] | null | undefined;
}

export interface GuardedCapabilityInput {
	db: DBClient;
	agentId: string;
	agentVersion: string;
	capabilityId: string;
	input: unknown;
	/** Runtime context passed straight to `capability.execute(input, ctx)`. */
	ctx: PlatformCapabilityContext;
	actor: GuardedCapabilityActor;
	/** Required for write capabilities; presence is enforced by tool-policy. */
	confirmationRef?: string;
	/** When invoked inside a workflow step, the step's allowed-capabilities list. */
	currentStepAllowedCapabilities?: readonly string[];
	intent?: string;
	/** Audit `finalAction` override, e.g. `'leave.submitted'`. */
	finalAction?: string;
	/** Audit `workflowId` / `workflowStep` context, if any. */
	workflowId?: string;
	workflowStep?: string;
	inputRefs?: unknown;
	metadata?: Record<string, unknown>;
}

export type GuardedCapabilityResult<T = unknown> =
	| { status: 'ok'; output: T; decision: PolicyDecision; auditId: string }
	| { status: 'denied'; decision: PolicyDecision; auditId: string }
	| { status: 'invalid_input'; error: string; decision: PolicyDecision; auditId: string }
	| { status: 'invalid_output'; error: string; decision: PolicyDecision; auditId: string }
	| { status: 'failed'; error: string; decision: PolicyDecision; auditId: string };

function formatZodIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
	return error.issues
		.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
		.join('; ');
}

/**
 * Execute a registered capability through the full policy + validation + audit
 * pipeline. Never throws for an expected outcome (denied / invalid / failed);
 * it returns a discriminated result and records audit for every branch.
 */
export async function executeGuardedCapability<T = unknown>(
	args: GuardedCapabilityInput
): Promise<GuardedCapabilityResult<T>> {
	const {
		db,
		agentId,
		agentVersion,
		capabilityId,
		input,
		ctx,
		actor,
		confirmationRef,
		currentStepAllowedCapabilities,
		intent,
		finalAction,
		workflowId,
		workflowStep,
		inputRefs,
		metadata
	} = args;

	const entry = lookupCapability(capabilityId);
	const idempotencyKey = entry?.manifest.idempotencyKey?.(input);
	const baseMetadata: Record<string, unknown> = {
		...(idempotencyKey ? { idempotencyKey } : {}),
		...(entry?.manifest.persistTarget ? { persistTarget: entry.manifest.persistTarget } : {}),
		...metadata
	};

	const decision = checkToolPolicy({
		agentId,
		capabilityId,
		userRoles: actor.roles,
		currentStepAllowedCapabilities,
		confirmationRef
	});

	const auditBase = {
		agentId,
		agentVersion,
		userId: actor.userId ?? null,
		userEmail: actor.userEmail ?? null,
		tenantId: ctx.tenantId,
		workflowId,
		workflowStep,
		intent,
		toolId: capabilityId,
		riskLevel: decision.riskLevel,
		confirmationRequired: decision.requiresConfirmation,
		confirmationRef,
		inputRefs
	};

	if (!decision.allowed) {
		const { auditId } = await appendAgentAuditEntry(db, {
			...auditBase,
			permissionResult: 'denied',
			finalAction: 'agent.policy_denied',
			status: 'denied',
			errorCode: decision.blockedBy.join(','),
			metadata: baseMetadata
		});
		return { status: 'denied', decision, auditId };
	}

	// Input validation (when the manifest declares a schema).
	if (entry?.manifest.inputSchema) {
		const parsed = entry.manifest.inputSchema.safeParse(input);
		if (!parsed.success) {
			const error = formatZodIssues(parsed.error);
			const { auditId } = await appendAgentAuditEntry(db, {
				...auditBase,
				permissionResult: 'allowed',
				finalAction: 'agent.invalid_input',
				status: 'failed',
				errorCode: 'invalid_input',
				metadata: { ...baseMetadata, validationError: error }
			});
			return { status: 'invalid_input', error, decision, auditId };
		}
	}

	let output: T;
	try {
		output = (await executeCapability(capabilityId, input, ctx)) as T;
	} catch (err) {
		const error = err instanceof Error ? err.message : 'Capability execution failed';
		const { auditId } = await appendAgentAuditEntry(db, {
			...auditBase,
			permissionResult: 'allowed',
			finalAction: finalAction ?? 'agent.capability_failed',
			status: 'failed',
			errorCode: 'execution_error',
			metadata: { ...baseMetadata, error }
		});
		return { status: 'failed', error, decision, auditId };
	}

	// Output validation (when the manifest declares a schema).
	if (entry?.manifest.outputSchema) {
		const parsed = entry.manifest.outputSchema.safeParse(output);
		if (!parsed.success) {
			const error = formatZodIssues(parsed.error);
			const { auditId } = await appendAgentAuditEntry(db, {
				...auditBase,
				permissionResult: 'allowed',
				finalAction: 'agent.invalid_output',
				status: 'failed',
				errorCode: 'invalid_output',
				metadata: { ...baseMetadata, validationError: error }
			});
			return { status: 'invalid_output', error, decision, auditId };
		}
	}

	const { auditId } = await appendAgentAuditEntry(db, {
		...auditBase,
		permissionResult: 'allowed',
		finalAction: finalAction ?? 'agent.capability_call',
		status: 'ok',
		outputRefs: { idempotencyKey },
		metadata: baseMetadata
	});

	return { status: 'ok', output, decision, auditId };
}
