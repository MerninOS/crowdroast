import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import {
  Coffee,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FlaskConical,
  Handshake,
  Package,
  Truck,
  TrendingDown,
  Users,
} from "lucide-react";

export default function HomePage() {
  const logos = [
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
    "/crowdroast_logo.svg",
  ];

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />

      <section className="relative overflow-hidden border-b bg-card px-4 py-14 md:py-20 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
          <div className="max-w-xl">
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full border bg-secondary px-4 py-1.5 text-sm font-medium text-secondary-foreground"
              style={{ animation: "fadeUp .7s ease both" }}
            >
              <Users className="h-3.5 w-3.5 text-primary" />
              Built for coffee roasters buying together
            </div>
            <h1
              className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl text-balance"
              style={{ animation: "fadeUp .7s ease both", animationDelay: "120ms" }}
            >
              Band together. Buy better coffee. Pay better prices.
            </h1>
            <p
              className="mt-6 text-lg leading-relaxed text-muted-foreground"
              style={{ animation: "fadeUp .7s ease both", animationDelay: "220ms" }}
            >
              CrowdRoast helps roasters commit as a group through trusted hub catalogs.
              As demand grows, pricing tiers unlock for everyone while quality stays front and center.
            </p>
            <div
              className="mt-8 flex flex-wrap items-center gap-3"
              style={{ animation: "fadeUp .7s ease both", animationDelay: "320ms" }}
            >
              <Link
                href="/auth/sign-up"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-8 text-base font-medium text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80 transition-colors"
              >
                Start Buying as a Group
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex h-12 items-center justify-center rounded-md border px-8 text-base font-medium text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80 transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-2xl border bg-muted/40 p-2">
              <img
                src="https://qqgpcaumfptnlstwjklv.supabase.co/storage/v1/object/public/landing_page_assets/Coffee-berries-in-hand.jpg"
                alt="Roasters evaluating green coffee"
                className="h-[420px] w-full rounded-xl object-cover"
                style={{ animation: "fadeIn .9s ease both .2s" }}
              />
            </div>
            <div className="absolute -bottom-5 -left-4 rounded-xl border bg-card p-4 shadow-md">
              <p className="text-xs text-muted-foreground">Live Tier</p>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-foreground">
                <TrendingDown className="h-4 w-4 text-primary" />
                Price dropped to $6.85/kg
              </p>
            </div>
            <div className="absolute -right-4 top-6 rounded-xl border bg-card p-4 shadow-md">
              <p className="text-xs text-muted-foreground">Group Momentum</p>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4 text-primary" />
                18 roasters committed
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b bg-card py-5">
        <div className="marquee-wrapper overflow-hidden">
          <div className="marquee-track flex min-w-max items-center gap-10 px-4">
            {logos.map((_, idx) => (
              <div key={`logo-a-${idx}`} className="flex items-center gap-3 opacity-80">
                <img src={_} alt="CrowdRoast" className="h-8 w-auto" />
              </div>
            ))}
            {logos.map((_, idx) => (
              <div key={`logo-b-${idx}`} className="flex items-center gap-3 opacity-80">
                <img src={_} alt="CrowdRoast" className="h-8 w-auto" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl text-balance">
              How buying works for roasters
            </h2>
            <p className="mt-3 text-muted-foreground">
              Start from curated quality, commit your volume, and let the campaign do the work.
              You always know what you are getting and what you are paying.
            </p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              {
                icon: FlaskConical,
                title: "1. Browse & cup with your hub",
                description:
                  "Your hub curates lots, organizes sample access, and helps you validate quality before you commit.",
              },
              {
                icon: Handshake,
                title: "2. Commit your quantity",
                description:
                  "Set your kg amount, pay at commitment, and join other roasters in the same campaign.",
              },
              {
                icon: CircleDollarSign,
                title: "3. Pay final campaign price",
                description:
                  "Funds are held until the deadline, then distributed on success. If minimum is not met, payments are refunded.",
              },
            ].map((item, idx) => (
              <article
                key={item.title}
                className="rounded-xl border bg-card p-6 shadow-sm"
                style={{ animation: "fadeUp .7s ease both", animationDelay: `${idx * 120 + 60}ms` }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-secondary/40 px-4 py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border bg-card p-2">
            <img
              src="https://qqgpcaumfptnlstwjklv.supabase.co/storage/v1/object/public/landing_page_assets/ripe-coffee-cherries-on-branch-of-coffee-tree-1024x576.jpg"
              alt="Green coffee lots ready for shipment"
              className="h-[360px] w-full rounded-xl object-cover"
            />
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl text-balance">
              What you get as a buyer
            </h2>
            <div className="grid gap-3">
              {[
                {
                  icon: TrendingDown,
                  title: "Better pricing from shared demand",
                  text: "As commitments increase, your tier improves with full transparency.",
                },
                {
                  icon: CheckCircle2,
                  title: "Quality-first workflow",
                  text: "Sample and cup before major buying decisions.",
                },
                {
                  icon: CalendarClock,
                  title: "Clear timing and campaign outcomes",
                  text: "Deadlines, status, and final pricing are easy to track.",
                },
                {
                  icon: Truck,
                  title: "Hub-managed logistics",
                  text: "Hubs coordinate movement and updates so buyers stay focused on roasting.",
                },
              ].map((benefit) => (
                <div key={benefit.title} className="flex items-start gap-3 rounded-lg border bg-card p-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <benefit.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{benefit.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{benefit.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl text-balance">
              From commitment to delivered coffee
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              { label: "Campaign opens", icon: Users },
              { label: "Tier unlocks", icon: TrendingDown },
              { label: "Settlement runs", icon: CircleDollarSign },
              { label: "Hub delivery", icon: Package },
            ].map((phase, idx) => (
              <div key={phase.label} className="rounded-xl border bg-card p-4 text-center shadow-sm">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <phase.icon className="h-4 w-4" />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">{phase.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">Step {idx + 1}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-primary px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-primary-foreground md:text-3xl text-balance">
            Ready to buy your next lot with your network?
          </h2>
          <p className="mt-3 text-primary-foreground/80 leading-relaxed">
            Join CrowdRoast and make every commitment count toward better quality and better pricing.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auth/sign-up"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-card px-8 text-base font-medium text-foreground shadow-sm hover:bg-card/90 active:bg-card/80 transition-colors"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card px-4 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center justify-center">
            <img src="/crowdroast_logo.svg" alt="CrowdRoast" className="h-24" />
          </div>
          <p className="text-xs text-muted-foreground">
            The specialty coffee marketplace. Built with care.
          </p>
        </div>
      </footer>

    </div>
  );
}
