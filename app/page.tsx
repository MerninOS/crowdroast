import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import {
  Coffee,
  Users,
  Truck,
  Shield,
  ArrowRight,
  BarChart3,
  Package,
  Zap,
  TrendingDown,
  CheckCircle2,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-card px-4 py-16 md:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-secondary px-4 py-1.5 text-sm font-medium text-secondary-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Group buying for specialty coffee
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl text-balance">
              Source specialty coffee through trusted hubs
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              CrowdRoast connects roasters with producers through hub-curated
              group buying. Pool demand with other buyers, unlock volume
              discounts, and get the best green coffee at the best price.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/auth/sign-up"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-8 text-base font-medium text-primary-foreground shadow-md hover:bg-primary/90 active:bg-primary/80 transition-colors"
              >
                Start Trading
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
        </div>
        {/* Decorative grid dots */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </section>

      {/* Stats bar */}
      <section className="border-b bg-card px-4 py-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 md:gap-16">
          {[
            { value: "50+", label: "Active Hubs" },
            { value: "1,200+", label: "Roasters" },
            { value: "15K", label: "Tonnes Traded" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold text-foreground md:text-3xl">
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl lg:text-4xl text-balance">
              How CrowdRoast Works
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground leading-relaxed">
              A transparent marketplace where every step from commitment to
              delivery is tracked and verified.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3 md:mt-16">
            {[
              {
                icon: Coffee,
                title: "Hubs Curate",
                description:
                  "Hub owners browse seller offerings, request samples, and hand-pick the best lots to feature in their catalog for their network of buyers.",
              },
              {
                icon: Package,
                title: "Buyers Commit",
                description:
                  "Buyers browse curated lots, attend hub cuppings, and commit to quantities. Pool demand with other buyers to unlock volume discounts.",
              },
              {
                icon: BarChart3,
                title: "Ship & Deliver",
                description:
                  "Once the minimum is hit, the sale triggers. The hub coordinates shipping from the seller. All logistics and claims flow through the hub.",
              },
            ].map((step, idx) => (
              <div
                key={step.title}
                className="relative flex flex-col rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" />
                </div>
                <span className="absolute right-6 top-6 text-4xl font-bold text-muted/80">
                  {idx + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key features */}
      <section className="border-t bg-secondary/30 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl lg:text-4xl text-balance">
              Why Buyers Love Group Buying
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: TrendingDown,
                title: "Volume Discounts",
                desc: "Price per kg drops as more buyers commit. The more demand, the better the deal for everyone.",
              },
              {
                icon: Users,
                title: "Community Driven",
                desc: "See who else is committing in real-time. Build excitement as the lot nears its minimum trigger.",
              },
              {
                icon: Shield,
                title: "Risk-Free Commitments",
                desc: "If the lot doesn't hit its minimum by the deadline, no one pays. Zero risk to commit early.",
              },
              {
                icon: CheckCircle2,
                title: "Quality Guaranteed",
                desc: "Request samples before committing. File quality claims through a structured dispute process.",
              },
              {
                icon: Zap,
                title: "Live Pricing",
                desc: "Watch pricing tiers unlock in real-time. Every new commitment brings the price closer to the lowest tier.",
              },
              {
                icon: Truck,
                title: "Hub-Managed Logistics",
                desc: "Your hub handles all shipping and logistics coordination. Just commit, and the coffee comes to you.",
              },
            ].map((feature) => (
              <div key={feature.title} className="flex gap-4 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-bold text-foreground md:text-3xl lg:text-4xl text-balance">
            Built for Every Role
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Truck,
                title: "Hub Owners",
                description:
                  "The heart of CrowdRoast. Browse seller offerings, curate your catalog, invite buyers, and manage the full supply chain from origin to roastery.",
                cta: "Join as Hub Owner",
              },
              {
                icon: Coffee,
                title: "Producers & Sellers",
                description:
                  "List your lots with tiered pricing and let hub owners discover your coffee. Manage samples, track commitments, and ship to hubs worldwide.",
                cta: "Join as Seller",
              },
              {
                icon: Users,
                title: "Roasters & Buyers",
                description:
                  "Get invited to a hub, browse curated lots, join cuppings, and commit to purchases. Pool demand with other buyers for volume discounts.",
                cta: "Join as Buyer",
              },
            ].map((role) => (
              <div
                key={role.title}
                className="flex flex-col rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <role.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {role.title}
                </h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground leading-relaxed">
                  {role.description}
                </p>
                <Link
                  href="/auth/sign-up"
                  className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 active:text-primary/70 transition-colors"
                >
                  {role.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-primary-foreground md:text-3xl text-balance">
            Ready to source better coffee?
          </h2>
          <p className="mt-3 text-primary-foreground/80 leading-relaxed">
            Join CrowdRoast today and start trading specialty coffee through
            trusted hub networks.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auth/sign-up"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-card px-8 text-base font-medium text-foreground shadow-md hover:bg-card/90 active:bg-card/80 transition-colors"
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
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Coffee className="h-3 w-3" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              CrowdRoast
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            The specialty coffee marketplace. Built with care.
          </p>
        </div>
      </footer>
    </div>
  );
}
