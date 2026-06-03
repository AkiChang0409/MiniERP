import { readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import type { GlobalSetupContext } from 'vitest/node';

export default async function setup({ provide }: GlobalSetupContext) {
	const migrations = await readD1Migrations('./drizzle/migrations');
	provide('d1Migrations', migrations);
}
