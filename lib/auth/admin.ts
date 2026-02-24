export function getConfiguredAdminEmail(): string | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return email || null;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const configured = getConfiguredAdminEmail();
  if (!configured || !email) return false;
  return email.trim().toLowerCase() === configured;
}
