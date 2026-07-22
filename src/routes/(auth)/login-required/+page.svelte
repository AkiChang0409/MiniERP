<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	// The path the user tried to reach (set by the auth gate in hooks.server.ts).
	const from = $derived(page.url.searchParams.get('from') ?? '');

	function goBack() {
		// Prefer real browser history; fall back to the login page if there's none
		// (e.g. the user opened the protected link directly in a fresh tab).
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else goto('/');
	}
</script>

<svelte:head><title>需要登录 · MiniERP</title></svelte:head>

<main class="flex min-h-screen w-full items-center justify-center bg-slate-50 px-6 py-12">
	<div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
		<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sf-green-soft)] text-[var(--sf-green)]">
			<span class="text-xl font-semibold">🔒</span>
		</div>
		<h1 class="mt-5 text-2xl font-semibold text-slate-900">需要登录</h1>
		<p class="mt-2 text-sm leading-relaxed text-slate-600">
			你访问的页面需要登录后才能查看。请登录你的 MiniERP 账号，或返回上一页。
		</p>
		{#if from}
			<p class="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
				目标页面：<span class="font-mono text-slate-700">{from}</span>
			</p>
		{/if}

		<div class="mt-6 flex flex-col gap-3 sm:flex-row">
			<button
				type="button"
				onclick={goBack}
				class="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
			>
				返回上一页
			</button>
			<a
				href="/"
				class="w-full rounded-md bg-[var(--sf-green)] px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-[#2f5e2c]"
			>
				前往登录
			</a>
		</div>
	</div>
</main>
