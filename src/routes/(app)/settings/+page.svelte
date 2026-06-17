<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data, form } = $props();

	function layerBadgeClass(layer: string) {
		if (layer === 'core') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
		if (layer === 'base') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
		return 'bg-slate-50 text-slate-700 border-slate-200';
	}
</script>

<PageShell
	eyebrow="Settings"
	title="System Settings"
	description="Configure enabled business modules. Dependency validation is enforced before saving."
>
	{#if form?.message}
		<p
			class={`mb-4 rounded-md border px-3 py-2 text-sm ${
				form.saved
					? 'border-emerald-200 bg-emerald-50 text-emerald-700'
					: 'border-rose-200 bg-rose-50 text-rose-700'
			}`}
		>
			{form.message}
		</p>
	{/if}

	<div class="grid gap-4 lg:grid-cols-3">
		<form method="POST" class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
			<div class="flex items-center justify-between">
				<h2 class="text-base font-semibold text-slate-800">Enabled Modules</h2>
				<span class="text-xs text-slate-500">{data.enabled.length} selected</span>
			</div>

			<div class="space-y-3">
				{#each data.modules as mod}
					<label class="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
						<input
							type="checkbox"
							name="module"
							value={mod.id}
							checked={data.enabled.includes(mod.id)}
							class="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--sf-green)] focus:ring-[var(--sf-green)]"
						/>
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<p class="text-sm font-medium text-slate-800">{mod.name}</p>
								<span class={`rounded border px-2 py-0.5 text-[11px] uppercase tracking-wide ${layerBadgeClass(mod.layer)}`}>
									{mod.layer}
								</span>
							</div>
							<p class="mt-1 text-xs text-slate-500">ID: {mod.id}</p>
							{#if mod.dependencies.length > 0}
								<p class="mt-1 text-xs text-slate-500">
									Depends on: {mod.dependencies.join(', ')}
								</p>
							{/if}
						</div>
					</label>
				{/each}
			</div>

			<div class="flex flex-wrap gap-3">
				<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
					Save Module Config
				</button>
			</div>
		</form>

		<div class="space-y-4">
			<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<h3 class="text-sm font-semibold text-slate-800">Dependency Status</h3>
				{#if data.validation.valid}
					<p class="mt-2 text-sm text-emerald-700">All dependencies are satisfied.</p>
				{:else}
					<p class="mt-2 text-sm text-rose-700">Some dependencies are missing.</p>
					<ul class="mt-2 space-y-1 text-xs text-rose-700">
						{#each data.validation.missing as issue}
							<li>{issue.moduleId}: missing {issue.missingDeps.join(', ')}</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
				<p class="font-semibold text-slate-700">Notes</p>
				<p class="mt-1">Core modules are always considered available during dependency checks.</p>
				<p class="mt-1">Runtime reads this configuration from <code>company_settings.modules.enabled</code>.</p>
			</div>

			<a
				href="/settings/qms-templates"
				class="block rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm transition hover:bg-emerald-50"
			>
				<h3 class="text-sm font-semibold text-emerald-800">质量管理 · ISO 9001</h3>
				<p class="mt-1 text-xs text-slate-600">
					维护 QMS 文件模板库（Quality Policy、Design Review、Incoming Inspection…）。task 模板会按 Task type 自动建议给 Gantt 任务。
				</p>
				<span class="mt-2 inline-block text-xs font-medium text-[var(--sf-green)]">打开模板库 →</span>
			</a>
		</div>
	</div>
</PageShell>


