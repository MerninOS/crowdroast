"use client";

import Link from "next/link";
import { Coffee, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      .then(({ data }) => setUser(data.user))
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-0">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex items-center justify-center">
            <img src="/crowdroast_logo.svg" alt="CrowdRoast" className="h-12" />
          </div>
        </Link>

        {/* Desktop nav -- only render auth-dependent buttons after mount to avoid hydration mismatch */}
        <nav className="hidden items-center gap-2 md:flex">
          {mounted ? (
            user ? (
              <Button asChild size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/auth/sign-up">Get Started</Link>
                </Button>
              </div>
            )
          ) : (
            /* placeholder to prevent layout shift */
            <div className="h-9 w-20" />
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors md:hidden"
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
        <div className="border-t bg-card px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-2">
            {mounted && user ? (
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground active:bg-primary/90"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-12 w-full items-center justify-center rounded-md border text-sm font-medium text-foreground active:bg-muted"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/sign-up"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground active:bg-primary/90"
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
