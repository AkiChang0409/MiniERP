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
		/** OCR.space API key — required for the `ocr_api` image text-extraction route. */
		OCR_SPACE_API_KEY?: string;
		/** OCR.space endpoint override. Default https://api.ocr.space/parse/image (free tier, 1 MB cap). */
		OCR_SPACE_ENDPOINT?: string;
		/** OCR.space engine (default 3 = auto-language LSTM). */
		OCR_SPACE_ENGINE?: string;
		/** OCR.space language code for engines 1/2 (ignored on engine 3). Default eng. */
		OCR_SPACE_LANGUAGE?: string;
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
		/** Lark (Feishu) app credentials + webhook verification token. */
		LARK_APP_ID?: string;
		LARK_APP_SECRET?: string;
		LARK_VERIFICATION_TOKEN?: string;
		/** Optional: API base. Default https://open.feishu.cn; international Lark = https://open.larksuite.com */
		LARK_BASE_URL?: string;
		/**
		 * Lark Bitable (多维表格) target for the Doc Hub record store. The app
		 * (LARK_APP_ID) must be added as an editor/manager collaborator on this
		 * Base, otherwise record read/write returns empty / permission errors.
		 * app_token + table_id come from the Base URL (feishu.cn/base/<app_token>?table=<table_id>).
		 */
		LARK_DOCHUB_APP_TOKEN?: string;
		LARK_DOCHUB_TABLE_ID?: string;
		/**
		 * Base app_token for the Bitable-as-source-of-truth sync (all 25 tables
		 * live in one Base). Falls back to LARK_DOCHUB_APP_TOKEN (same Base).
		 */
		LARK_BITABLE_APP_TOKEN?: string;
		/**
		 * Business Partner table id in the Bitable Base. When set, sales-crm (and
		 * later procurement) read customer/supplier master from the Bitable mirror
		 * instead of the legacy D1 `business_partners` table (facade repoint, B5).
		 */
		LARK_BP_TABLE_ID?: string;
		/** Projects + Business Partner tables live in the same Base (share LARK_DOCHUB_APP_TOKEN). */
		LARK_PROJECT_TABLE_ID?: string;
		LARK_SUPPLIER_TABLE_ID?: string;
		/** Classification dictionary table (Secondary Category → Primary Category), same Base. */
		LARK_DICT_TABLE_ID?: string;
		/** HMAC secret for QC intake signed upload tokens (see src/app/qc-intake/token.ts). */
		QC_TOKEN_SECRET?: string;
		/** Monitored inbox that supplier email replies go to (fallback channel B). Defaults to EMAIL_FROM. */
		QC_INBOX_EMAIL?: string;
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
