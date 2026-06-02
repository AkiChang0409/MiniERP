// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	interface Env {
		DB: D1Database;
		R2: R2Bucket;
		KV: KVNamespace;
		OCR_QUEUE: Queue;
		/**
		 * Async document-processing queue (Ship 2 inbox pipeline).
		 *
		 * Producers: POST /api/documents (after stored), POST
		 * /api/documents/[id]/reclassify.
		 * Consumer: workers/document-processor.ts.
		 *
		 * Optional binding because the SvelteKit dev server may run without a
		 * queue locally; in that case the upload route should fall back to
		 * inline sync processing (best-effort dev UX).
		 */
		DOCUMENT_QUEUE?: Queue;
		AI?: Ai;
		/** Workers AI vision model for document image OCR (default @cf/meta/llama-3.2-11b-vision-instruct). */
		WORKERS_AI_VISION_MODEL?: string;
		/** Image OCR provider preference. `openai` disables silent Workers AI fallback for image OCR. */
		OCR_IMAGE_PROVIDER?: 'auto' | 'openai' | 'workers_ai';
		/** OpenAI API key for vision OCR (and external LLM extraction). Falls back to LLM_API_KEY. */
		OPENAI_API_KEY?: string;
		/** OpenAI vision model for image OCR (default gpt-4o-mini). */
		OPENAI_VISION_MODEL?: string;
		/** Local PaddleOCR HTTP service base or full `/ocr` URL (e.g. http://127.0.0.1:8765). When set, tried before Workers AI. */
		PADDLE_OCR_URL?: string;
		/** If `true`, only use Paddle (`PADDLE_OCR_URL`); no Workers AI fallback. */
		OCR_PADDLE_ONLY?: string;
		OCR_PROVIDER?: 'mock' | 'external';
		OCR_API_URL?: string;
		OCR_API_KEY?: string;
		LLM_PROVIDER?: 'heuristic' | 'external';
		/** Set to `false` to never call `LLM_API_URL` (Workers AI + heuristics only). */
		LLM_USE_EXTERNAL?: string;
		/** Set to `true` to skip Workers AI and use external HTTP LLM when `LLM_API_URL` is set. */
		LLM_SKIP_WORKERS?: string;
		LLM_API_URL?: string;
		LLM_API_KEY?: string;
		OCR_PROMPT_VERSION?: string;
		BETTER_AUTH_SECRET?: string;
		BETTER_AUTH_URL?: string;
		/** Resend API (transactional email: verify, reset password). Optional in dev (logs only). */
		RESEND_API_KEY?: string;
		EMAIL_FROM?: string;
	}

	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties
		}

		// interface Error {}
		interface Locals {
			user: {
				id: string;
				email: string;
				roles: Array<
					'owner' | 'admin' | 'finance' | 'project_manager' | 'hr' | 'staff' | 'employee'
				>;
			} | null;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
