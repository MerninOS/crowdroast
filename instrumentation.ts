export async function register(): Promise<void> {
  if (process.env.VERCEL) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateDevEnv } = await import("./lib/env-validate");
  validateDevEnv();
}
