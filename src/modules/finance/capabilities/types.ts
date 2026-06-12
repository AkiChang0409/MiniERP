import type { z } from 'zod';
import type { FinanceRiskLevel } from '../agent/types';

export interface FinanceCapabilityContext {
	tenantId?: string;
	userId?: string;
	useMock?: boolean;
	/**
	 * Optional Cloudflare Workers env. Capabilities that call Workers AI
	 * (extract-document-fields LLM fallback, etc.) read `env.AI` here.
	 * Callers running in routes / workers populate it; mock-only callers can
	 * omit. The capability internally guards on presence.
	 */
	env?: Env;
}

export interface FinanceCapabilityDescriptor {
	id: string;
	description: string;
	riskLevel: FinanceRiskLevel;
}

export interface FinanceCapability<TInput, TOutput> extends FinanceCapabilityDescriptor {
	/**
	 * Runtime Zod schema for the capability input. Required in the finance
	 * reference module: the platform registry serializes it into a JSON Schema
	 * tool spec (see `listToolSpecs`) so the Finance Agent can invoke this
	 * capability via function-calling. This is the "SDK-for-agent" contract.
	 */
	inputSchema: z.ZodType<TInput>;
	execute(input: TInput, ctx: FinanceCapabilityContext): Promise<TOutput>;
}
