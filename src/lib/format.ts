export function formatGHS(amount: number | string, opts?: { currency?: string }): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  const currency = opts?.currency ?? "GHS";
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

export function pluralize(n: number, singular: string, plural?: string) {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural ?? singular + "s"}`;
}
