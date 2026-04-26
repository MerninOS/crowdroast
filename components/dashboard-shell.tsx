"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Warehouse,
  FileWarning,
  FlaskConical,
  CreditCard,
  LogOut,
  Menu,
  X,
  User as UserIcon,
  Shield,
  Search,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { Profile, UserRole } from "@/lib/types";
import { UnitToggle } from "@/components/unit-toggle";
import { CrTicker } from "@/components/cr-ticker";
import { NavTab as UiNavTab } from "@merninos/ui";

type DashboardRole = UserRole | "admin";

const navByRole = {
  buyer: [
    { href: "/dashboard/buyer", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/buyer/commitments", label: "Commitments", icon: ShoppingCart },
    { href: "/dashboard/buyer/cuppings", label: "Cuppings", icon: FlaskConical },
    { href: "/dashboard/buyer/claims", label: "Claims", icon: FileWarning },
    { href: "/dashboard/find-hub", label: "Find a Hub", icon: Search },
    { href: "/dashboard/buyer/access-request", label: "Role Request", icon: UserIcon },
  ],
  seller: [
    { href: "/dashboard/seller", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/seller/lots", label: "My Lots", icon: Package },
    { href: "/dashboard/seller/commitments", label: "Commitments", icon: ShoppingCart },
    { href: "/dashboard/seller/samples", label: "Sample Requests", icon: FlaskConical },
    { href: "/dashboard/seller/payouts", label: "Payouts", icon: CreditCard },
    { href: "/dashboard/seller/shipments", label: "Shipments", icon: Truck },
  ],
  hub_owner: [
    { href: "/dashboard/hub", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/hub/hubs", label: "My Hubs", icon: Warehouse },
    { href: "/dashboard/hub/catalog", label: "Catalog", icon: Package },
    { href: "/dashboard/hub/members", label: "Members", icon: UserIcon },
    { href: "/dashboard/hub/samples", label: "Samples", icon: FlaskConical },
    { href: "/dashboard/hub/payouts", label: "Payouts", icon: CreditCard },
    { href: "/dashboard/hub/shipments", label: "Shipments", icon: Truck },
  ],
  admin: [
    { href: "/dashboard/admin/roles", label: "Roles & Users", icon: Shield },
    { href: "/dashboard/admin/hubs", label: "Hubs", icon: Warehouse },
    { href: "/dashboard/admin/invites", label: "Invitations", icon: UserIcon },
    { href: "/dashboard/admin/requests", label: "Access Requests", icon: ShoppingCart },
    { href: "/dashboard/admin/claims", label: "Claims", icon: FileWarning },
    { href: "/dashboard/admin/refunds", label: "Refunds", icon: CreditCard },
    { href: "/dashboard/admin/payouts", label: "Payouts", icon: CreditCard },
  ],
};

// Signature leaf mark — reserved for CrowdRoast identity
function Leaf({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 21c0-8 5-14 18-18-2 14-10 18-18 18z" fill="currentColor" fillOpacity="0.18" />
      <path d="M3 21c5-5 10-10 18-18" />
    </svg>
  );
}

function NavTab({
  href,
  label,
  isActive,
  onClick,
}: {
  href: string;
  label: string;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <UiNavTab asChild active={isActive}>
      <Link href={href} onClick={onClick}>
        {label}
      </Link>
    </UiNavTab>
  );
}

function MobileNavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-headline font-bold tracking-tight ${
        isActive
          ? "bg-espresso text-cream"
          : "text-espresso/80 hover:bg-cream active:bg-cream"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function DashboardShell({
  user,
  profile,
  role,
  children,
}: {
  user: User;
  profile: Profile | null;
  role: DashboardRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = navByRole[role] || navByRole.buyer;
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const displayName = profile?.contact_name || profile?.company_name || "User";
  const avatarChar = displayName.charAt(0).toUpperCase();
  const roleLabel =
    role === "hub_owner" ? "Hub Owner" : role === "admin" ? "Admin" : role.charAt(0).toUpperCase() + role.slice(1);

  const roleRoots = ["/dashboard", "/dashboard/buyer", "/dashboard/seller", "/dashboard/hub", "/dashboard/admin"];
  const isNavActive = (href: string) =>
    pathname === href || (!roleRoots.includes(href) && pathname.startsWith(href + "/"));

  return (
    <div className="flex min-h-svh flex-col bg-cream">
      {/* ─── TOP BAR ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b-3 border-espresso bg-cream">
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3.5 lg:px-7">
          {/* Identity */}
          <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-[10px] border-3 border-espresso bg-sun text-espresso shadow-flat-sm"
              style={{ transform: "rotate(-4deg)" }}
            >
              <Leaf size={22} />
            </div>
            <div className="hidden sm:block leading-none">
              <div className="font-display text-2xl uppercase tracking-[0.01em] text-espresso">
                CrowdRoast
              </div>
              <div className="mt-0.5 text-[9.5px] font-body font-bold uppercase tracking-[0.16em] text-espresso/60">
                coffee · together
              </div>
            </div>
          </Link>

          {/* Primary nav — desktop */}
          <nav className="ml-7 hidden flex-1 items-center gap-2 lg:flex">
            {navItems.map((item) => (
              <NavTab
                key={item.href}
                href={item.href}
                label={item.label}
                isActive={isNavActive(item.href)}
              />
            ))}
          </nav>

          <div className="flex-1 lg:hidden" />

          {/* Right rail — unit toggle + user chip */}
          <div className="hidden items-center gap-2.5 lg:flex">
            <UnitToggle />
            <div className="text-right leading-tight whitespace-nowrap">
              <div className="font-headline text-[14px] font-bold tracking-[-0.01em] text-espresso">
                {displayName}
              </div>
              <div className="mt-0.5 text-[10.5px] font-body font-bold uppercase tracking-[0.16em] text-espresso/55">
                {roleLabel}
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border-3 border-espresso bg-honey font-headline text-lg font-extrabold text-espresso">
              {avatarChar}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-[8px] border-3 border-espresso bg-cream text-espresso hover:bg-chalk transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile: hamburger only */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-[8px] border-3 border-espresso bg-cream text-espresso hover:bg-chalk lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ─── MOBILE DRAWER ───────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-espresso/25 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
          onTouchEnd={(e) => {
            e.preventDefault();
            closeMobile();
          }}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r-3 border-espresso bg-chalk shadow-flat-lg transition-transform duration-200 ease-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b-3 border-espresso px-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-espresso bg-sun text-espresso"
              style={{ transform: "rotate(-4deg)" }}
            >
              <Leaf size={18} />
            </div>
            <span className="font-display text-xl uppercase text-espresso">CrowdRoast</span>
          </div>
          <button
            type="button"
            onClick={closeMobile}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-espresso hover:bg-cream active:bg-cream/80"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pt-3 pb-1">
          <p className="px-3 text-[11px] font-body font-bold uppercase tracking-[0.16em] text-espresso/55">
            {roleLabel}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
          {navItems.map((item) => (
            <MobileNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isNavActive(item.href)}
              onClick={closeMobile}
            />
          ))}
        </nav>

        <div className="border-t-3 border-espresso p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-espresso bg-honey font-headline text-base font-extrabold text-espresso">
              {avatarChar}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-headline text-sm font-bold tracking-tight text-espresso">
                {displayName}
              </p>
              <p className="truncate text-xs text-espresso/55">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-1 flex h-10 w-full items-center rounded-md px-3 text-sm font-headline font-bold tracking-tight text-espresso/70 transition-colors hover:text-espresso active:bg-cream"
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ─── MAIN ────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <CrTicker />
        <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
