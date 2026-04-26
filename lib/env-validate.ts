const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const STRIPE_KEY_PATTERN = /^sk_(test|live)_/;

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

function fail(message: string): never {
  console.error(`\n${RED}${BOLD}[dev-env] ${message}${RESET}\n`);
  process.exit(1);
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function checkSupabaseUrlIsLocal(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL — copy .env.local.example to .env.local.");
  }
  const host = hostnameOf(url);
  if (!host) {
    fail(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    fail(
      `Refusing to start dev: Supabase URL points at non-local host "${host}".\n` +
        `Set NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 in .env.local.`,
    );
  }
}

function checkStripeKeyAndLogMode(): void {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    fail("Missing STRIPE_SECRET_KEY — fill it in .env.local from your Stripe sandbox dashboard.");
  }
  if (!STRIPE_KEY_PATTERN.test(key)) {
    fail(
      `Invalid STRIPE_SECRET_KEY shape — expected sk_test_... or sk_live_..., got "${key.slice(0, 10)}...".`,
    );
  }
  if (key.startsWith("sk_test_")) {
    console.log(`${GREEN}${BOLD}[stripe] mode: TEST (sandbox) ✓${RESET}`);
    return;
  }

  const banner = "[stripe] mode: LIVE — you are connected to PRODUCTION Stripe";
  const line = "═".repeat(banner.length + 4);
  console.log(`\n${RED}${BOLD}${line}${RESET}`);
  console.log(`${RED}${BOLD}  ${banner}  ${RESET}`);
  console.log(`${RED}${BOLD}${line}${RESET}`);
  console.log(`${YELLOW}  Charges, refunds, and webhooks will hit real customer Stripe accounts.${RESET}`);
  console.log(`${YELLOW}  The local Supabase guard still blocks writes to prod DB, so data is safe,${RESET}`);
  console.log(`${YELLOW}  but be deliberate about every Stripe call you make from here.${RESET}\n`);
}

export function validateDevEnv(): void {
  checkSupabaseUrlIsLocal();
  checkStripeKeyAndLogMode();
}
