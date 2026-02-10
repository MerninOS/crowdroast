import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import {
  Coffee,
  Users,
  Truck,
  Shield,
  ArrowRight,
  BarChart3,
  Package,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-primary px-4 py-20 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-primary-foreground lg:text-6xl text-balance">
              Specialty coffee, sourced through trusted hubs.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-primary-foreground/80">
              CrowdRoast connects specialty coffee roasters with producers
              through hub-curated group buying. Hub owners source the best lots,
              invite their buyers, and manage the entire supply chain.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Link href="/auth/sign-up">
                  Start Trading
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent"
              >
                <Link href="/auth/login">Sign In</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/10" />
        <div className="pointer-events-none absolute -bottom-16 right-1/4 h-64 w-64 rounded-full bg-primary-foreground/5" />
      </section>

      {/* How it works */}
      <section className="px-4 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground lg:text-4xl text-balance">
              How CrowdRoast Works
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground leading-relaxed">
              A transparent marketplace where every step from commitment to
              delivery is tracked and verified.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Coffee,
                title: "Hubs Curate",
                description:
                  "Hub owners browse seller offerings, request samples, and hand-pick the best lots to feature in their hub catalog for their network of buyers.",
              },
              {
                icon: Package,
                title: "Buyers Commit",
                description:
                  "Buyers see only the lots curated by their hub. They request samples, commit to quantities, and pool demand together through the hub.",
              },
              {
                icon: BarChart3,
                title: "Ship & Deliver",
                description:
                  "Once a lot is fully committed, the hub coordinates shipping from the seller. All logistics, tracking, and quality claims flow through the hub.",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="flex flex-col items-center text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground">
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

      {/* Roles */}
      <section className="border-t bg-muted/30 px-4 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-3xl font-bold text-foreground lg:text-4xl text-balance">
            Built for Every Role
          </h2>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
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
                  "List your lots and let hub owners discover your coffee. Manage sample requests, track commitments, and ship to hubs worldwide.",
                cta: "Join as Seller",
              },
              {
                icon: Users,
                title: "Roasters & Buyers",
                description:
                  "Get invited to a hub, browse curated lots, request samples, and commit to purchases. No middleman hunting -- your hub handles everything.",
                cta: "Join as Buyer",
              },
            ].map((role) => (
              <div
                key={role.title}
                className="rounded-xl border bg-card p-8 transition-shadow hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <role.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground">
                  {role.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {role.description}
                </p>
                <Button asChild variant="link" className="mt-4 px-0 text-primary">
                  <Link href="/auth/sign-up">
                    {role.cta}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="px-4 py-20 lg:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <Shield className="mx-auto h-12 w-12 text-accent" />
          <h2 className="mt-6 text-3xl font-bold text-foreground lg:text-4xl text-balance">
            Transparent & Secure
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground leading-relaxed">
            Every commitment is tracked on-chain. Quality claims are resolved
            through a structured dispute process. Sellers and buyers build
            verifiable reputations over time.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/auth/sign-up">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-primary">
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
