/**
 * Lightweight, KV-backed conversation state for the orchestrator (design §10).
 * Generalizes the HR Lark `lark:pending:<openId>` confirmation pattern into a
 * channel-agnostic store keyed by conversationId. It supports multi-turn
 * clarification, pending write confirmation (payload-hash guarded, resumable),
 * and remembering the last resolved entities so follow-ups don't re-ask.
 *
 * The actual write still runs through the governed capability runtime — this
 * store only remembers *what* was proposed and *whether the user confirmed it*.
 */
import type { PlatformRiskLevel } from '../capability-registry';
import { hashConfirmationPayload } from '../../workflow/payload-hash';
import type { ChannelSource, OrchestratorCandidate } from './contracts';
import type { ResolvedEntities } from './entity-resolver';

export interface AgentPendingClarification {
	question: string;
	expectedSlot?: string;
	candidates?: OrchestratorCandidate[];
}

export interface AgentPendingConfirmation {
	actionId: string;
	agentId: string;
	capabilityId: string;
	riskLevel: PlatformRiskLevel;
	summary: string;
	/** sha256 of the canonicalized input — recomputed on confirm to detect drift. */
	payloadHash: string;
	/** The validated capability input to execute once the user confirms. */
	input: unknown;
	expiresAt: string;
}

export interface AgentConversationState {
	conversationId: string;
	source: ChannelSource;
	userId?: string;
	tenantId?: string;
	lastResolvedEntities?: ResolvedEntities;
	pendingClarification?: AgentPendingClarification;
	pendingConfirmation?: AgentPendingConfirmation;
	updatedAt: string;
}

const TTL_SECONDS = 60 * 60; // 1 hour
const CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function key(conversationId: string): string {
	return `agent-convo:${conversationId}`;
}

export async function getConversationState(
	kv: KVNamespace,
	conversationId: string
): Promise<AgentConversationState | null> {
	const raw = await kv.get(key(conversationId));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as AgentConversationState;
	} catch {
		return null;
	}
}

export async function saveConversationState(
	kv: KVNamespace,
	state: AgentConversationState
): Promise<void> {
	const next: AgentConversationState = { ...state, updatedAt: new Date().toISOString() };
	await kv.put(key(state.conversationId), JSON.stringify(next), { expirationTtl: TTL_SECONDS });
}

export async function clearConversationState(
	kv: KVNamespace,
	conversationId: string
): Promise<void> {
	await kv.delete(key(conversationId));
}

/**
 * Stage a pending write confirmation. Computes the payload hash and an
 * expiry; the orchestrator returns a preview to the user and resumes the action
 * when they confirm (see {@link consumePendingConfirmation}).
 */
export async function setPendingConfirmation(
	kv: KVNamespace,
	base: Pick<AgentConversationState, 'conversationId' | 'source' | 'userId' | 'tenantId'>,
	confirmation: Omit<AgentPendingConfirmation, 'payloadHash' | 'expiresAt'>
): Promise<AgentPendingConfirmation> {
	const payloadHash = await hashConfirmationPayload(confirmation.input);
	const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();
	const pending: AgentPendingConfirmation = { ...confirmation, payloadHash, expiresAt };

	const existing = (await getConversationState(kv, base.conversationId)) ?? {
		conversationId: base.conversationId,
		source: base.source,
		userId: base.userId,
		tenantId: base.tenantId,
		updatedAt: new Date().toISOString()
	};
	await saveConversationState(kv, { ...existing, ...base, pendingConfirmation: pending });
	return pending;
}

export type ConfirmationOutcome =
	| { ok: true; confirmation: AgentPendingConfirmation }
	| { ok: false; reason: 'none_pending' | 'expired' | 'hash_mismatch' | 'action_mismatch' };

/**
 * Verify and consume a pending confirmation. On success the pending entry is
 * cleared (idempotency: a re-delivered confirm finds nothing pending) and the
 * caller may execute the staged action through the governed runtime.
 */
export async function consumePendingConfirmation(
	kv: KVNamespace,
	conversationId: string,
	expected: { actionId: string; payloadHash?: string }
): Promise<ConfirmationOutcome> {
	const state = await getConversationState(kv, conversationId);
	const pending = state?.pendingConfirmation;
	if (!state || !pending) return { ok: false, reason: 'none_pending' };

	if (pending.actionId !== expected.actionId) return { ok: false, reason: 'action_mismatch' };
	if (new Date(pending.expiresAt).getTime() < Date.now()) {
		await saveConversationState(kv, { ...state, pendingConfirmation: undefined });
		return { ok: false, reason: 'expired' };
	}
	if (expected.payloadHash && expected.payloadHash !== pending.payloadHash) {
		return { ok: false, reason: 'hash_mismatch' };
	}

	// Clear before returning so a retried confirm cannot double-execute.
	await saveConversationState(kv, { ...state, pendingConfirmation: undefined });
	return { ok: true, confirmation: pending };
}
