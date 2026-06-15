<script lang="ts">
	import { onMount } from 'svelte';

	type Notif = {
		id: string;
		kind: string;
		message: string;
		isRead: boolean;
		projectId: string | null;
		taskId: string | null;
		createdAt: string;
	};

	let items = $state<Notif[]>([]);
	let unreadCount = $state(0);
	let open = $state(false);
	let loading = $state(false);

	async function load() {
		loading = true;
		try {
			const res: any = await fetch('/api/projects/notifications').then((r) => r.json());
			const data = res?.data ?? res ?? {};
			items = (data.items ?? []) as Notif[];
			unreadCount = Number(data.unreadCount ?? 0);
		} catch {
			/* offline / not signed in — leave as-is */
		} finally {
			loading = false;
		}
	}

	async function markRead(n: Notif) {
		if (!n.isRead) {
			n.isRead = true;
			unreadCount = Math.max(0, unreadCount - 1);
			await fetch(`/api/projects/notifications/${n.id}/read`, { method: 'POST' });
		}
		if (n.projectId) {
			open = false;
			window.location.href = `/projects/${n.projectId}/tasks`;
		}
	}

	async function markAll() {
		unreadCount = 0;
		items = items.map((n) => ({ ...n, isRead: true }));
		await fetch('/api/projects/notifications/read-all', { method: 'POST' });
	}

	onMount(() => {
		load();
		const t = setInterval(load, 60_000);
		return () => clearInterval(t);
	});
</script>

<div class="relative">
	<button
		type="button"
		class="relative rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 transition hover:bg-slate-50"
		aria-label="Notifications"
		onclick={() => {
			open = !open;
			if (open) load();
		}}
	>
		<span aria-hidden="true">🔔</span>
		{#if unreadCount > 0}
			<span
				class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white"
			>
				{unreadCount > 9 ? '9+' : unreadCount}
			</span>
		{/if}
	</button>

	{#if open}
		<button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onclick={() => (open = false)}></button>
		<div class="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
				<span class="text-xs font-semibold text-slate-700">Notifications</span>
				{#if items.some((n) => !n.isRead)}
					<button type="button" class="text-[11px] font-medium text-[var(--sf-green)] hover:underline" onclick={markAll}>Mark all read</button>
				{/if}
			</div>
			<div class="max-h-96 overflow-y-auto">
				{#if loading && items.length === 0}
					<p class="px-3 py-6 text-center text-xs text-slate-400">Loading…</p>
				{:else if items.length === 0}
					<p class="px-3 py-6 text-center text-xs text-slate-400">You're all caught up.</p>
				{:else}
					{#each items as n (n.id)}
						<button
							type="button"
							class={`block w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 ${n.isRead ? '' : 'bg-rose-50/40'}`}
							onclick={() => markRead(n)}
						>
							<div class="flex items-start gap-2">
								{#if !n.isRead}<span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"></span>{:else}<span class="mt-1 h-1.5 w-1.5 shrink-0"></span>{/if}
								<div class="min-w-0">
									<p class="text-xs text-slate-700">{n.message}</p>
									<p class="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{n.kind}</p>
								</div>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
