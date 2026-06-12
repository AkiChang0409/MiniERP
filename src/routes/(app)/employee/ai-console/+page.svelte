<script lang="ts">
	let { data, form } = $props();

	let message = $state('');

	const examples = [
		'查看待审批请假',
		'提交请假 年假 2026-07-01 2026-07-03 家庭事务',
		'批准请假 <粘贴 leaveRequestId>'
	];

	function leaveTypeIdForCode(code: string | undefined): string {
		if (!code) return '';
		const match = data.leaveTypes.find((t) => t.code === code);
		return match?.id ?? '';
	}

	const params = $derived((form?.params ?? {}) as Record<string, string | undefined>);
</script>

<div style="max-width: 880px; margin: 0 auto; padding: 24px;">
	<h1 style="font-size: 22px; font-weight: 700;">HR AI Capability 测试台</h1>
	<p style="color:#666; font-size: 13px; margin-top: 4px;">
		规则化意图（无 LLM）→ <code>executeGuardedCapability</code> → tool-policy + 审计。
	</p>

	<div style="margin-top:12px; padding:12px; background:#f5f5f4; border-radius:8px; font-size:13px;">
		<div>登录用户：<strong>{data.userEmail ?? '(未登录)'}</strong></div>
		<div>角色：<strong>{data.roles.join(', ') || '(无)'}</strong></div>
		<div>
			绑定 personId：<strong>{data.boundPersonId ?? '(未绑定 — 无法提交请假)'}</strong>
		</div>
	</div>

	<!-- Step 1: command -->
	<form method="POST" action="?/interpret" style="margin-top:20px;">
		<label for="message" style="font-weight:600; font-size:14px;">输入指令</label>
		<input
			id="message"
			name="message"
			bind:value={message}
			placeholder="例如：查看待审批请假"
			style="width:100%; padding:8px; margin-top:6px; border:1px solid #ccc; border-radius:6px;"
		/>
		<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
			{#each examples as ex}
				<button
					type="button"
					onclick={() => (message = ex)}
					style="font-size:12px; padding:4px 8px; border:1px solid #ccc; border-radius:6px; background:#fff; cursor:pointer;"
				>
					{ex}
				</button>
			{/each}
		</div>
		<button
			type="submit"
			style="margin-top:10px; padding:8px 16px; background:#1a1a1a; color:#fff; border:none; border-radius:6px; cursor:pointer;"
		>
			解析并执行
		</button>
	</form>

	<!-- error -->
	{#if form?.stage === 'error'}
		<div style="margin-top:16px; padding:12px; background:#fdecea; border:1px solid #f5c2bd; border-radius:8px; color:#a4271a;">
			{form.error}
		</div>
	{/if}

	<!-- Step 2: confirmation form for write capabilities -->
	{#if form?.stage === 'confirm' && form.capabilityId === 'hr.submit-leave-request'}
		<form method="POST" action="?/execute" style="margin-top:16px; padding:16px; border:1px solid #ddd; border-radius:8px;">
			<h3 style="font-weight:700; margin-bottom:8px;">确认：提交请假（写操作，需确认）</h3>
			<input type="hidden" name="capabilityId" value="hr.submit-leave-request" />

			<div style="font-size:13px; margin-top:8px;">请假类型</div>
			<select name="leaveTypeId" style="width:100%; padding:6px; margin-top:4px;">
				{#each data.leaveTypes as t}
					<option value={t.id} selected={t.id === leaveTypeIdForCode(params.leaveTypeCode)}>
						{t.name} ({t.code})
					</option>
				{/each}
			</select>

			<div style="display:flex; gap:12px; margin-top:8px;">
				<div style="flex:1;">
					<div style="font-size:13px;">开始日期</div>
					<input name="startDate" value={params.startDate ?? ''} placeholder="YYYY-MM-DD" style="width:100%; padding:6px;" />
				</div>
				<div style="flex:1;">
					<div style="font-size:13px;">结束日期</div>
					<input name="endDate" value={params.endDate ?? ''} placeholder="YYYY-MM-DD" style="width:100%; padding:6px;" />
				</div>
			</div>

			<div style="font-size:13px; margin-top:8px;">原因（可选）</div>
			<input name="reason" value={params.reason ?? ''} style="width:100%; padding:6px;" />

			<label style="display:block; font-size:13px; margin-top:10px;">
				<input type="checkbox" name="withConfirmation" checked /> 附带 confirmationRef（取消勾选可演示「无确认 → 被拒」）
			</label>

			<button type="submit" style="margin-top:10px; padding:8px 16px; background:#2d5a3d; color:#fff; border:none; border-radius:6px; cursor:pointer;">
				确认执行
			</button>
		</form>
	{/if}

	{#if form?.stage === 'confirm' && form.capabilityId === 'hr.approve-leave-request'}
		<form method="POST" action="?/execute" style="margin-top:16px; padding:16px; border:1px solid #ddd; border-radius:8px;">
			<h3 style="font-weight:700; margin-bottom:8px;">确认：批准请假（写操作，需 hr:approve + 确认）</h3>
			<input type="hidden" name="capabilityId" value="hr.approve-leave-request" />

			<div style="font-size:13px; margin-top:8px;">leaveRequestId</div>
			<input name="leaveRequestId" value={params.leaveRequestId ?? ''} placeholder="粘贴待审批请假的 id" style="width:100%; padding:6px;" />

			<div style="font-size:13px; margin-top:8px;">审批备注（可选）</div>
			<input name="comment" value={params.comment ?? ''} style="width:100%; padding:6px;" />

			<label style="display:block; font-size:13px; margin-top:10px;">
				<input type="checkbox" name="withConfirmation" checked /> 附带 confirmationRef（取消勾选可演示「无确认 → 被拒」）
			</label>

			<button type="submit" style="margin-top:10px; padding:8px 16px; background:#2d5a3d; color:#fff; border:none; border-radius:6px; cursor:pointer;">
				确认执行
			</button>
		</form>
	{/if}

	<!-- Result -->
	{#if form?.stage === 'result' && form.run}
		{@const run = form.run}
		<div style="margin-top:16px; padding:16px; border:1px solid #ddd; border-radius:8px;">
			<h3 style="font-weight:700;">执行结果</h3>
			<div style="font-size:13px; margin-top:6px;">
				<div>capability：<code>{form.capabilityId}</code></div>
				<div>
					status：<strong style="color: {run.status === 'ok' ? '#2d5a3d' : run.status === 'denied' ? '#a4271a' : '#b45309'};">{run.status}</strong>
				</div>
				<div>riskLevel：{run.riskLevel}</div>
				{#if form.withConfirmation !== undefined}
					<div>带 confirmationRef：{form.withConfirmation ? '是' : '否'}</div>
				{/if}
				<div>auditId：<code>{run.auditId}</code></div>
				{#if run.blockedBy && run.blockedBy.length}
					<div style="color:#a4271a;">blockedBy：{run.blockedBy.join(', ')}</div>
				{/if}
				{#if run.missingPermissions && run.missingPermissions.length}
					<div style="color:#a4271a;">missingPermissions：{run.missingPermissions.join(', ')}</div>
				{/if}
				{#if run.error}
					<div style="color:#b45309;">error：{run.error}</div>
				{/if}
			</div>
			{#if run.output !== undefined}
				<pre style="margin-top:10px; padding:10px; background:#1a1a1a; color:#e8e8e8; border-radius:6px; overflow:auto; font-size:12px;">{JSON.stringify(run.output, null, 2)}</pre>
			{/if}
		</div>
	{/if}
</div>
