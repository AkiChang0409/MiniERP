/**
 * Builds the minimal RuntimeContextEnvelope (design §4) from a normalized
 * inbound message, then lets registered context providers augment it (recent
 * projects, enabled modules, …). Kept small on purpose: classify intent on a
 * lean context, retrieve targeted business context only after routing.
 */
import type {
	ContextProvider,
	InboundAgentMessage,
	RuntimeContextEnvelope
} from './contracts';

export async function buildRuntimeContext(
	message: InboundAgentMessage,
	providers: readonly ContextProvider[] = []
): Promise<RuntimeContextEnvelope> {
	let envelope: RuntimeContextEnvelope = {
		source: message.source,
		userId: message.userId,
		tenantId: message.tenantId,
		roles: message.roles ?? [],
		channel: {
			type: message.channel?.type ?? 'direct',
			externalChannelId: message.channel?.externalChannelId,
			conversationId: message.conversationId
		},
		routeContext: message.routeContext
	};

	for (const provider of providers) {
		const patch = await provider.contribute(message, envelope);
		envelope = {
			...envelope,
			...patch,
			recentContext: { ...envelope.recentContext, ...patch.recentContext }
		};
	}

	return envelope;
}
