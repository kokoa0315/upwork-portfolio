export function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function date(iso: string) {
  // Plain dates (yyyy-mm-dd) are calendar days, not instants: format them in UTC so they don't shift a day.
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const roleLabel: Record<string, string> = { owner: "Owner", member: "Member" };
export const statusText: Record<string, string> = { open: "Open", overdue: "Overdue", paid: "Paid" };
