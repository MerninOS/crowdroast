"use client";

import React from "react"

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Coffee,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Warehouse,
  FileWarning,
  FlaskConical,
  LogOut,
  Menu,
  X,
  User as UserIcon,
} from "lucide-react";
import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

const navByRole = {
  buyer: [
    { href: "/dashboard/buyer", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/buyer/browse", label: "Browse Lots", icon: Coffee },
    { href: "/dashboard/buyer/commitments", label: "Commitments", icon: ShoppingCart },
    { href: "/dashboard/buyer/samples", label: "Samples", icon: FlaskConical },
    { href: "/dashboard/buyer/claims", label: "Claims", icon: FileWarning },
  ],
  seller: [
    { href: "/dashboard/seller", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/seller/lots", label: "My Lots", icon: Package },
    { href: "/dashboard/seller/commitments", label: "Commitments", icon: ShoppingCart },
    { href: "/dashboard/seller/samples", label: "Sample Requests", icon: FlaskConical },
    { href: "/dashboard/seller/shipments", label: "Shipments", icon: Truck },
  ],
  hub_owner: [
    { href: "/dashboard/hub", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/hub/hubs", label: "My Hubs", icon: Warehouse },
    { href: "/dashboard/hub/catalog", label: "Catalog", icon: Package },
    { href: "/dashboard/hub/members", label: "Members", icon: UserIcon },
    { href: "/dashboard/hub/samples", label: "Samples", icon: FlaskConical },
    { href: "/dashboard/hub/shipments", label: "Shipments", icon: Truck },
  ],
};

export function DashboardShell({
  user,
  profile,
  children,
}: {
  user: User;
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = (profile?.role || user.user_metadata?.role || "buyer") as keyof typeof navByRole;
  const navItems = navByRole[role] || navByRole.buyer;

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-2 border-b px-6">
            <Coffee className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-primary">CrowdRoast</span>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {profile?.contact_name || profile?.company_name || "User"}
                </p>
                <p className="truncate text-xs text-muted-foreground capitalize">
                  {role === "hub_owner" ? "Hub Owner" : role}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Coffee className="h-6 w-6 text-primary" />
            <span className="font-bold text-primary">CrowdRoast</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {mobileOpen && (
          <div className="border-b bg-card px-4 py-3 lg:hidden">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </nav>
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
