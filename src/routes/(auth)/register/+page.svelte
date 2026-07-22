<script lang="ts">
	import { onMount } from 'svelte';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let inviteCode = $state('');
	let loading = $state(false);
	let error = $state('');
	let done = $state(false);
	let isFirstUser = $state<boolean | null>(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/auth/register');
			if (res.ok) {
				const data = (await res.json()) as { isFirstUser?: boolean };
				isFirstUser = data.isFirstUser ?? false;
			} else {
				isFirstUser = false;
			}
		} catch {
			isFirstUser = false;
		}
	});

	async function onSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';

		try {
			const payload: Record<string, string> = {
				name: name.trim(),
				email: email.trim().toLowerCase(),
				password
			};
			if (inviteCode.trim()) {
				payload.inviteCode = inviteCode.trim();
			}

			const res = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				error = data.error || 'Registration failed.';
				loading = false;
				return;
			}
			done = true;
		} catch {
			error = 'Network error. Please try again.';
		}
		loading = false;
	}
</script>

<main class="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-12">
	<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
		<h1 class="text-2xl font-semibold text-slate-900">Create your MiniERP account</h1>
		{#if isFirstUser}
			<p class="mt-2 text-sm text-emerald-700">
				No users exist yet. You will be registered as the workspace owner.
			</p>
		{:else}
			<p class="mt-2 text-sm text-slate-600">
				Enter your invite code to join the workspace. Contact your admin if you don't have one.
			</p>
		{/if}
		{#if done}
			<p class="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
				Account created successfully. You can now sign in.
			</p>
			<a class="mt-4 inline-block text-sm font-medium text-[var(--sf-green)] underline" href="/login"
				>Go to sign in</a
			>
		{:else}
			{#if error}
				<p class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
			{/if}
			<form class="mt-6 space-y-4" onsubmit={onSubmit}>
				<label class="block text-sm font-medium text-slate-700">
					Name
					<input
						type="text"
						autocomplete="name"
						bind:value={name}
						required
						class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--sf-green)] focus:ring-2"
					/>
				</label>
				<label class="block text-sm font-medium text-slate-700">
					Email
					<input
						type="email"
						autocomplete="email"
						bind:value={email}
						required
						class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--sf-green)] focus:ring-2"
					/>
				</label>
				<label class="block text-sm font-medium text-slate-700">
					Password
					<input
						type="password"
						autocomplete="new-password"
						bind:value={password}
						required
						minlength="8"
						class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--sf-green)] focus:ring-2"
					/>
					<span class="mt-1 block text-xs text-slate-500">At least 8 characters.</span>
				</label>
				{#if isFirstUser === false}
					<label class="block text-sm font-medium text-slate-700">
						Invite Code
						<input
							type="text"
							bind:value={inviteCode}
							placeholder="Enter your invite code (first user can leave blank)"
							class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tracking-wider outline-none ring-[var(--sf-green)] focus:ring-2"
						/>
					</label>
				{/if}
				<button
					type="submit"
					disabled={loading || isFirstUser === null}
					class="w-full rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2f5e2c] disabled:opacity-60"
				>
					{loading ? 'Creating...' : isFirstUser ? 'Create Workspace' : 'Register'}
				</button>
			</form>
			<p class="mt-4 text-center text-sm text-slate-600">
				Already have an account?
				<a class="font-medium text-[var(--sf-green)] underline" href="/login">Sign in</a>
			</p>
		{/if}
	</div>
</main>
