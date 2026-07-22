<script lang="ts">
	import { authClient } from '$platform/auth/client';
	import coverArt from '$app-layer/assets/smartfin_cover_art.svg';
	import bgLight from '$app-layer/assets/smartfin_bg_light.svg';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');

	async function onSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		const { error: err } = await authClient.signIn.email({
			email: email.trim(),
			password
		});
		loading = false;
		if (err) {
			error = err.message || 'Sign-in failed.';
			return;
		}
		window.location.href = '/finance/dashboard';
	}
</script>

<main
	class="min-h-screen w-full bg-cover bg-center bg-no-repeat px-6 py-8"
	style={`background-image: linear-gradient(rgba(255,255,255,0.62), rgba(255,255,255,0.62)), url(${bgLight});`}
>
	<div class="mx-auto grid min-h-[78vh] w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm backdrop-blur-[1px] lg:grid-cols-2">
		<section class="relative hidden lg:block">
			<img src={coverArt} alt="MiniERP cover art" class="h-full w-full object-cover" />
			<div class="absolute inset-0 bg-gradient-to-tr from-slate-900/50 via-slate-900/20 to-transparent"></div>
			<div class="absolute bottom-8 left-8 right-8 text-white">
				<p class="mb-2 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur">MiniERP</p>
				<h1 class="text-3xl font-semibold leading-tight">Welcome to your financial operations workspace</h1>
				<p class="mt-3 text-sm text-slate-100/90">AR, projects, expenses, tax and reporting in one cloud console.</p>
			</div>
		</section>

		<section class="flex items-center justify-center bg-white/40 p-6 sm:p-10">
			<div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<p class="text-xs font-medium uppercase tracking-wide text-[var(--sf-green)]">Welcome back</p>
				<h2 class="mt-1 text-2xl font-semibold text-slate-900">Sign in to MiniERP</h2>
				<p class="mt-2 text-sm text-slate-600">Use your registered email and password.</p>
				{#if error}
					<p class="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
				{/if}
				<form class="mt-6 space-y-4" onsubmit={onSubmit}>
					<label class="block text-sm font-medium text-slate-700">
						Email
						<input
							type="email"
							autocomplete="email"
							bind:value={email}
							required
							class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--sf-green)] focus:ring-2"
							placeholder="name@company.com"
						/>
					</label>
					<label class="block text-sm font-medium text-slate-700">
						Password
						<input
							type="password"
							autocomplete="current-password"
							bind:value={password}
							required
							minlength="8"
							class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--sf-green)] focus:ring-2"
						/>
					</label>
					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2f5e2c] disabled:opacity-60"
					>
						{loading ? 'Signing in...' : 'Sign in'}
					</button>
				</form>
				<div class="mt-4 flex items-center justify-between text-sm">
					<a class="text-[var(--sf-green)] underline" href="/forgot-password">Forgot password?</a>
					<a class="text-slate-600 hover:text-slate-900" href="/register">Create account</a>
				</div>
			</div>
		</section>
	</div>
</main>


