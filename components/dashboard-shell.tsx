"use client";

import React from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/mernin/Button";
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
import { useState, useEffect, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile, UserRole } from "@/lib/types";
import { UnitToggle } from "@/components/unit-toggle";

type DashboardRole = UserRole | "admin";

const navByRole = {
  buyer: [
    { href: "/dashboard/buyer", label: "Overview", icon: LayoutDashboard },
    {
      href: "/dashboard/buyer/commitments",
      label: "Commitments",
      icon: ShoppingCart,
    },
    {
      href: "/dashboard/buyer/cuppings",
      label: "Cuppings",
      icon: FlaskConical,
    },
    { href: "/dashboard/buyer/claims", label: "Claims", icon: FileWarning },
    { href: "/dashboard/find-hub", label: "Find a Hub", icon: Search },
    {
      href: "/dashboard/buyer/access-request",
      label: "Role Request",
      icon: UserIcon,
    },
  ],
  seller: [
    { href: "/dashboard/seller", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/seller/lots", label: "My Lots", icon: Package },
    {
      href: "/dashboard/seller/commitments",
      label: "Commitments",
      icon: ShoppingCart,
    },
    {
      href: "/dashboard/seller/samples",
      label: "Sample Requests",
      icon: FlaskConical,
    },
    { href: "/dashboard/seller/payouts", label: "Payouts", icon: CreditCard },
    { href: "/dashboard/seller/shipments", label: "Shipments", icon: Truck },
  ],
  hub_owner: [
    { href: "/dashboard/hub", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/hub/hubs", label: "My Hubs", icon: Warehouse },
    { href: "/dashboard/hub/catalog", label: "Catalog", icon: Package },
    { href: "/dashboard/hub/members", label: "Members", icon: UserIcon },
    {
      href: "/dashboard/hub/samples",
      label: "Samples",
      icon: FlaskConical,
    },
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

function NavLink({
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
      className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-body font-medium transition-colors active:opacity-80 ${
        isActive
          ? "text-tomato bg-cream border-2 border-espresso"
          : "text-espresso/70 hover:bg-cream hover:text-espresso active:bg-cream"
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const roleLabel =
    role === "hub_owner"
      ? "Hub Owner"
      : role === "admin"
        ? "Admin"
      : role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div className="flex min-h-svh bg-cream">
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 border-r-3 border-espresso bg-chalk lg:flex lg:flex-col">
        <div className="flex h-14 items-center border-b-3 border-espresso px-5">
          <img src="/crowdroast_logo.png" alt="CrowdRoast" className="h-18" />
        </div>

        <div className="px-3 pt-3 pb-1">
          <p className="px-3 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-espresso/60">
            {roleLabel}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={
                pathname === item.href
              }
            />
          ))}
        </nav>

        <div className="border-t-3 border-espresso p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cream border-2 border-espresso text-espresso">
              <UserIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-body font-medium text-espresso">
                {profile?.contact_name || profile?.company_name || "User"}
              </p>
              <p className="truncate text-xs font-body text-espresso/60">
                {user.email}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start text-espresso/60 hover:text-tomato"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile overlay -- use onTouchEnd to ensure it fires on iOS */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-espresso/20 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
          onTouchEnd={(e) => {
            e.preventDefault();
            closeMobile();
          }}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-chalk border-r-3 border-espresso shadow-flat-lg transition-transform duration-200 ease-out lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex h-14 items-center justify-between border-b-3 border-espresso px-4">
          <div className="flex items-center">
            <img src="/crowdroast_logo.png" alt="CrowdRoast" className="h-6" />
          </div>
          <button
            type="button"
            onClick={closeMobile}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-espresso hover:bg-cream active:bg-cream/80"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pt-3 pb-1">
          <p className="px-3 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-espresso/60">
            {roleLabel}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(item.href + "/"))
              }
              onClick={closeMobile}
            />
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t-3 border-espresso bg-chalk p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cream border-2 border-espresso text-espresso">
              <UserIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-body font-medium text-espresso">
                {profile?.contact_name || profile?.company_name || "User"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-1 flex h-10 w-full items-center rounded-md px-3 text-sm font-body font-medium text-espresso/60 hover:text-tomato active:bg-cream transition-colors"
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="hidden h-14 items-center justify-end border-b-3 border-espresso bg-chalk px-6 lg:flex">
          <UnitToggle />
        </header>

        {/* Mobile top bar */}
        <header className="flex h-14 items-center justify-between border-b-3 border-espresso bg-chalk px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-espresso hover:bg-cream active:bg-cream/80 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center">
            <img src="/crowdroast_logo.png" alt="CrowdRoast" className="h-8" />
          </div>
          <UnitToggle />
        </header>

        <main className="flex-1 overflow-auto bg-cream">
          <div className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
