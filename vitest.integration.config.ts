import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineWorkersConfig({
	resolve: {
		alias: {
			$infrastructure: resolve(__dirname, 'src/infrastructure'),
			$modules: resolve(__dirname, 'src/modules'),
			$platform: resolve(__dirname, 'src/platform'),
			'$app-layer': resolve(__dirname, 'src/app')
		}
	},
	test: {
		include: ['src/**/*.integration.test.ts'],
		globalSetup: ['./src/test/integration/global-setup.ts'],
		poolOptions: {
			workers: {
				singleWorker: true,
				wranglerConfigPath: './wrangler.test.jsonc',
				miniflare: {
					compatibilityDate: '2025-09-06',
					compatibilityFlags: ['nodejs_als'],
					d1Databases: ['DB']
				}
			}
		}
	}
});
