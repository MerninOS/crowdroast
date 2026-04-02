"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function SiteHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) => setUser(data.user))
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full bg-cream border-b-3 border-espresso">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-0">
        <Link href="/" className="flex items-center">
          <img src="/crowdroast_logo.svg" alt="CrowdRoast" className="h-10" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-2 md:flex">
          {mounted ? (
            user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center bg-tomato text-cream border-3 border-espresso rounded-pill px-6 py-2 text-sm font-bold uppercase tracking-[0.08em] shadow-flat-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-md active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
              >
                Dashboard
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center text-espresso px-5 py-2 text-sm font-bold uppercase tracking-[0.08em] hover:text-tomato transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/sign-up"
                  className="inline-flex items-center justify-center bg-espresso text-cream border-3 border-espresso rounded-pill px-6 py-2 text-sm font-bold uppercase tracking-[0.08em] shadow-flat-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-md active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
                >
                  Get Started
                </Link>
              </div>
            )
          ) : (
            <div className="h-9 w-20" />
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center border-3 border-espresso rounded-lg text-espresso hover:bg-fog active:bg-fog/80 transition-colors md:hidden"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="border-t-3 border-espresso bg-chalk px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-2">
            {mounted && user ? (
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex h-12 w-full items-center justify-center rounded-pill bg-tomato border-3 border-espresso text-sm font-bold uppercase tracking-[0.08em] text-cream shadow-flat-sm"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-12 w-full items-center justify-center rounded-pill border-3 border-espresso text-sm font-bold uppercase tracking-[0.08em] text-espresso hover:bg-fog transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/sign-up"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-12 w-full items-center justify-center rounded-pill bg-espresso border-3 border-espresso text-sm font-bold uppercase tracking-[0.08em] text-cream shadow-flat-sm"
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
