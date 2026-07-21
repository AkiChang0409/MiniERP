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

/**
 * One governed write staged inside a pending confirmation. A confirmation may
 * carry several (the unified loop can propose a batch of writes that the user
 * confirms together); each item executes through `executeGuardedCapability` as
 * its owning agent.
 */
export interface AgentPendingWriteItem {
	agentId: string;
	capabilityId: string;
	riskLevel: PlatformRiskLevel;
	summary: string;
	/** The validated capability input to execute once the user confirms. */
	input: unknown;
}

export interface AgentPendingConfirmation {
	actionId: string;
	/** 1..n writes applied in order on confirm. */
	items: AgentPendingWriteItem[];
	/** Combined human-readable summary for the confirmation card. */
	summary: string;
	/** sha256 of the canonicalized items — recomputed on confirm to detect drift. */
	payloadHash: string;
	expiresAt: string;
}

/** One prior turn in the conversation (P4.1 layer 2 — multi-turn continuity). */
export interface AgentConversationTurn {
	role: 'user' | 'assistant';
	text: string;
}

export interface AgentConversationState {
	conversationId: string;
	source: ChannelSource;
	userId?: string;
	tenantId?: string;
	lastResolvedEntities?: ResolvedEntities;
	pendingClarification?: AgentPendingClarification;
	pendingConfirmation?: AgentPendingConfirmation;
	/** Recent turns (oldest→newest), capped; fed back to the loop as prior context. */
	history?: AgentConversationTurn[];
	/** Rolling summary of turns that aged out of `history` (P4.2 layer 3). */
	summary?: string;
	updatedAt: string;
}

/** Default number of recent turns kept for continuity. */
const DEFAULT_MAX_HISTORY_TURNS = 6;

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

export interface AppendTurnsOptions {
	maxTurns?: number;
	/**
	 * Fold overflow turns (those aging out of `history`) into a rolling summary
	 * (P4.2 layer 3). Best-effort — if it throws, the prior summary is kept.
	 */
	summarize?: (priorSummary: string | undefined, dropped: AgentConversationTurn[]) => Promise<string>;
	/** Merge into `lastResolvedEntities` for pronoun continuity (P4.2 layer 4). */
	entities?: ResolvedEntities;
}

/**
 * Append turns to the conversation history (oldest→newest), capped to the last
 * `maxTurns`. Overflow turns can be folded into a rolling `summary`, and recent
 * entities merged into `lastResolvedEntities`. Creates the state if absent. Keyed
 * by conversationId (channel+user scoped), so nothing crosses users.
 */
export async function appendConversationTurns(
	kv: KVNamespace,
	base: Pick<AgentConversationState, 'conversationId' | 'source' | 'userId' | 'tenantId'>,
	turns: AgentConversationTurn[],
	opts: AppendTurnsOptions = {}
): Promise<void> {
	const maxTurns = opts.maxTurns ?? DEFAULT_MAX_HISTORY_TURNS;
	const existing = await getConversationState(kv, base.conversationId);

	const merged = [...(existing?.history ?? []), ...turns];
	let history = merged;
	let summary = existing?.summary;
	if (merged.length > maxTurns) {
		const dropped = merged.slice(0, merged.length - maxTurns);
		history = merged.slice(-maxTurns);
		if (opts.summarize && dropped.length > 0) {
			try {
				summary = await opts.summarize(existing?.summary, dropped);
			} catch {
				/* keep the prior summary — summarization is best-effort */
			}
		}
	}

	const lastResolvedEntities = opts.entities
		? { ...(existing?.lastResolvedEntities ?? {}), ...opts.entities }
		: existing?.lastResolvedEntities;

	const next: AgentConversationState = {
		...(existing ?? { conversationId: base.conversationId, source: base.source, updatedAt: '' }),
		...base,
		history,
		summary,
		lastResolvedEntities
	};
	await saveConversationState(kv, next);
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
	const payloadHash = await hashConfirmationPayload(confirmation.items);
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
