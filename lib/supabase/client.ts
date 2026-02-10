import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Return a stub that won't throw so the page still renders.
    // Auth-dependent features will simply behave as logged-out.
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-anon-key',
    )
  }

  client = createBrowserClient(url, key)
  return client
}
