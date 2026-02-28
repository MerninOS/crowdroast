function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export type AdminCapableRole = "buyer" | "seller" | "hub_owner" | "admin";

export function getConfiguredAdminEmails(): string[] {
  const single = normalizeEmail(process.env.ADMIN_EMAIL);
  const multiple = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set([...(single ? [single] : []), ...multiple]));
}

export function getConfiguredAdminEmail(): string | null {
  return getConfiguredAdminEmails()[0] || null;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getConfiguredAdminEmails().includes(normalized);
}

export function isAdminAccount({
  email,
  role,
}: {
  email: string | null | undefined;
  role: string | null | undefined;
}): boolean {
  return role === "admin" || isAdminEmail(email);
}
