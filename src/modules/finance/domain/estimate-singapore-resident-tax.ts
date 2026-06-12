export function estimateSingaporeResidentTax(chargeableIncome: number): number {
	if (!Number.isFinite(chargeableIncome) || chargeableIncome <= 0) return 0;

	let tax = 0;
	let left = chargeableIncome;

	const bands: { size: number; rate: number }[] = [
		{ size: 20000, rate: 0 },
		{ size: 10000, rate: 0.02 },
		{ size: 10000, rate: 0.035 },
		{ size: 40000, rate: 0.07 },
		{ size: 40000, rate: 0.115 },
		{ size: 40000, rate: 0.15 },
		{ size: 40000, rate: 0.18 },
		{ size: 40000, rate: 0.19 },
		{ size: 40000, rate: 0.195 },
		{ size: 40000, rate: 0.2 },
		{ size: 180000, rate: 0.22 }
	];

	for (const band of bands) {
		if (left <= 0) break;
		const slice = Math.min(band.size, left);
		tax += slice * band.rate;
		left -= slice;
	}

	if (left > 0) tax += left * 0.24;
	return Math.round(tax * 100) / 100;
}
