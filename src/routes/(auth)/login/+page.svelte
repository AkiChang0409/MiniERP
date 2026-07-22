<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '$platform/auth/client';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let message = $state('');
	let error = $state('');

	const notice = $derived(page.url.searchParams.get('notice'));
	const verified = $derived(page.url.searchParams.get('verified'));
	const urlError = $derived(page.url.searchParams.get('error'));

	$effect(() => {
		if (verified === '1') {
			message = 'Email verified. You can sign in.';
		} else if (urlError === 'invalid_token') {
			error = 'This link is invalid or has expired.';
		} else if (notice === 'check-email') {
			message = 'Check your inbox to verify your email before signing in.';
		} else if (notice === 'reset') {
			message = 'Password updated. You can sign in.';
		}
	});

	async function onSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		message = '';
		const { error: err } = await authClient.signIn.email({
			email: email.trim(),
			password
		});
		loading = false;
		if (err) {
			if (err.status === 403) {
				error =
					'Please verify your email first. Use “Resend verification�?below if you did not receive the message.';
			} else {
				error = err.message || 'Sign-in failed.';
			}
			return;
		}
		window.location.href = '/finance/dashboard';
	}

	async function resendVerification() {
		if (!email.trim()) {
			error = 'Enter your email above, then click resend.';
			return;
		}
		loading = true;
		error = '';
		const { error: err } = await authClient.sendVerificationEmail({
			email: email.trim(),
			callbackURL: `${window.location.origin}/login?verified=1`
		});
		loading = false;
		if (err) {
			error = err.message || 'Could not send email.';
			return;
		}
		message = 'If an account exists for this email, a verification message has been sent.';
	}
</script>

<main class="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-12">
	<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
		<h1 class="text-2xl font-semibold text-slate-900">Sign in to MiniERP</h1>
		<p class="mt-2 text-sm text-slate-600">Use the email and password you registered with.</p>
		{#if message}
			<p class="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
		{/if}
		{#if error}
			<p class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
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
		<div class="mt-4 flex flex-col gap-2 text-sm">
			<button
				type="button"
				class="text-left text-[var(--sf-green)] underline decoration-[rgba(56,114,52,0.35)] hover:decoration-[var(--sf-green)]"
				onclick={resendVerification}
			>
				Resend verification email
			</button>
			<a class="text-[var(--sf-green)] underline" href="/forgot-password">Forgot password?</a>
			<a class="text-slate-600 hover:text-slate-900" href="/register">Create an account</a>
		</div>
	</div>
</main>


