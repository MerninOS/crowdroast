import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ArrowRight, Star, TrendingDown, Users } from "lucide-react";

const tiers = [
  { label: "Entry (0–500 lb)", price: "$6.80", active: false },
  { label: "Group (500–1,500 lb)", price: "$5.40", active: true },
  { label: "Full (1,500 lb+)", price: "$4.32", active: false },
];

const steps = [
  {
    num: "01",
    title: "City Hubs curate the lots",
    body: "Your hub owner sources, cups, and vets exceptional green coffee before listing it for the community.",
  },
  {
    num: "02",
    title: "Roasters commit volume",
    body: "Pledge your lb amount and join the campaign. If the minimum isn't met, you're fully refunded.",
  },
  {
    num: "03",
    title: "Tiers unlock, settlement runs",
    body: "At deadline, the final tier determines pricing. Stripe handles payment and distribution automatically.",
  },
];

const testimonials = [
  {
    quote:
      "We used to struggle to hit minimum orders on specialty lots. With CrowdRoast, we pooled with four other roasters and unlocked a Tier 3 price we'd never have gotten alone.",
    name: "Marcus T.",
    role: "Owner, Driftwood Roasting Co.",
    initials: "MT",
    avatarBg: "bg-tomato",
  },
  {
    quote:
      "Running cupping events through the platform and converting those sessions into commitments in the same day changed everything about how I run my hub.",
    name: "Priya S.",
    role: "Hub Operator, Pacific Rim Coffee Guild",
    initials: "PS",
    avatarBg: "bg-sky",
  },
  {
    quote:
      "As an importer, knowing committed volume before we finalize shipping logistics is a game changer. CrowdRoast gives us that certainty without the usual back-and-forth.",
    name: "João M.",
    role: "Director, Altura Green Coffee",
    initials: "JM",
    avatarBg: "bg-matcha",
  },
];

const marqueeItems = [
  "Group buying for specialty coffee",
  "✦",
  "Commit together. Save together.",
  "✦",
  "Hub-curated lots",
  "✦",
  "Tier pricing unlocked by volume",
  "✦",
  "Roasters. Hub owners. Farms.",
  "✦",
  "100% refunded if minimums aren't met",
  "✦",
];

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      {/* ─── MARQUEE BAR ──────────────────────────────────────────────────── */}
      <div className="bg-tomato overflow-hidden py-2.5 border-b-3 border-espresso">
        <div
          className="inline-flex gap-8 whitespace-nowrap text-cream text-[11px] font-bold uppercase tracking-[0.12em] marquee-track"
          aria-hidden="true"
        >
          {[...Array(2)].map((_, i) => (
            <span key={i} className="inline-flex gap-8 pr-8">
              {marqueeItems.map((item, j) => (
                <span key={j}>{item}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <SiteHeader />

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <section className="bg-cream px-4 pt-16 pb-20 md:pt-24 md:pb-28 border-b-5 border-espresso">
        <div className="mx-auto max-w-7xl">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 bg-sun border-3 border-espresso rounded-pill px-4 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-espresso mb-8 shadow-flat-sm"
            style={{ animation: "fadeUp 0.45s ease both" }}
          >
            <Users className="h-3.5 w-3.5" />
            Group buying for specialty coffee
          </div>

          <div className="grid lg:grid-cols-[1fr_420px] gap-12 items-start">
            {/* Left: copy */}
            <div>
              <h1
                className="font-display text-[clamp(4rem,8vw,5rem)] leading-[0.9] text-espresso uppercase mb-6"
                style={{ animation: "fadeUp 0.45s ease both 0.08s" }}
              >
                The more roasters commit,{" "}
                <span className="text-tomato">the less everyone pays.</span>
              </h1>
              <p
                className="text-lg text-[#7A6A50] max-w-lg leading-relaxed mb-8"
                style={{ animation: "fadeUp 0.45s ease both 0.16s" }}
              >
                Get better pricing on exceptional green coffee lots by banding together with coffee roasters in your area.
              </p>

              <div
                className="flex flex-wrap gap-3 mb-14"
                style={{ animation: "fadeUp 0.45s ease both 0.24s" }}
              >
                <Link
                  href="/marketplace"
                  className="inline-flex items-center gap-2 bg-tomato text-cream border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] shadow-flat-md hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-lg active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
                >
                  Browse Open Lots
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 text-espresso border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] hover:bg-espresso hover:text-cream transition-all duration-100"
                >
                  How It Works
                </a>
              </div>

              {/* Stats */}
              <div
                className="flex flex-wrap gap-4"
                style={{ animation: "fadeUp 0.45s ease both 0.34s" }}
              >
                {[
                  { value: "23+", label: "Active roasters" },
                  { value: "$4.32", label: "Best tier / lb" },
                  { value: "100%", label: "Refund if min not met" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-chalk border-3 border-espresso rounded-xl p-4 shadow-flat-sm"
                  >
                    <p className="font-headline text-4xl text-tomato leading-none">
                      {stat.value}
                    </p>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7A6A50] mt-1">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: campaign card */}
            <div
              className="border-5 border-espresso rounded-xl bg-chalk shadow-flat-lg overflow-hidden"
              style={{ animation: "fadeIn 0.7s ease both 0.3s" }}
            >
              {/* Card top band */}
              <div className="bg-espresso px-6 py-3 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-cream">
                  Live Campaign
                </span>
                <span className="inline-flex items-center bg-matcha text-cream text-[11px] font-black uppercase tracking-[0.08em] px-3 py-0.5 rounded-pill border-2 border-fog">
                  Active
                </span>
              </div>

              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-headline text-2xl text-espresso leading-tight">
                      Ethiopia Yirgacheffe Natural
                    </h3>
                    <p className="text-xs text-[#7A6A50] mt-0.5 font-medium">
                      Gedeo Zone · 1900–2200m · Heirloom
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 bg-sun border-2 border-espresso rounded-lg px-2.5 py-1.5 shadow-[2px_2px_0_#1C0F05]">
                    <Star className="h-3.5 w-3.5 fill-espresso text-espresso" />
                    <span className="text-sm font-black text-espresso">
                      90.5
                    </span>
                  </div>
                </div>

                {/* Flavor notes */}
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {["Blueberry", "Jasmine", "Dark Chocolate"].map((note) => (
                    <span
                      key={note}
                      className="bg-fog border-2 border-espresso rounded-pill px-3 py-0.5 text-xs font-bold text-espresso"
                    >
                      {note}
                    </span>
                  ))}
                </div>

                {/* Tier table */}
                <div className="border-3 border-espresso rounded-xl overflow-hidden mb-5 shadow-flat-sm">
                  <div className="flex items-center justify-between bg-espresso px-4 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cream">
                    <span>Commitment Tier</span>
                    <span>Price / lb</span>
                  </div>
                  {tiers.map((tier) => (
                    <div
                      key={tier.label}
                      className={`flex items-center px-4 py-2.5 text-sm border-t-2 border-espresso ${
                        tier.active ? "bg-tomato" : "bg-chalk"
                      }`}
                    >
                      <span
                        className={`flex-1 font-bold ${
                          tier.active ? "text-cream" : "text-[#7A6A50]"
                        }`}
                      >
                        {tier.label}
                      </span>
                      <span
                        className={`font-black ${
                          tier.active ? "text-cream" : "text-fog"
                        }`}
                      >
                        {tier.price}
                      </span>
                      {tier.active && (
                        <span className="ml-2 rounded-pill bg-cream text-tomato text-[10px] font-black uppercase tracking-wide px-2 py-0.5 border-2 border-espresso">
                          Now
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#7A6A50] font-medium">
                      Campaign progress
                    </span>
                    <span className="font-black text-espresso">68%</span>
                  </div>
                  <div className="relative h-4 overflow-hidden rounded-pill bg-fog border-2 border-espresso">
                    <div className="campaign-bar absolute left-0 top-0 h-full rounded-pill bg-tomato" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#7A6A50] font-medium">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      23 roasters committed
                    </span>
                    <span>1,020 / 1,500 lb</span>
                  </div>
                </div>
              </div>

              {/* Footer strip */}
              <div className="bg-fog border-t-3 border-espresso px-6 py-3 flex items-center gap-2">
                <TrendingDown className="h-3.5 w-3.5 text-tomato shrink-0" />
                <p className="text-xs font-bold text-espresso">
                  Price dropped to{" "}
                  <span className="text-tomato">$5.40/lb</span> — 480 lb to
                  unlock Full tier
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="bg-tomato px-4 py-20 md:py-24 border-b-5 border-espresso"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-cream uppercase leading-none mb-1">
            Get big coffee prices
          </h2>
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-espresso uppercase leading-none mb-10">
            Even as a small brand
          </h2>
          <p className="text-cream/80 text-lg mb-14 max-w-xl">
            Every commitment moves the bar. Every roaster gets the benefit.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <div
                key={step.num}
                className="bg-chalk border-5 border-espresso rounded-xl p-6 shadow-flat-lg"
                style={{
                  animation: `fadeUp 0.5s cubic-bezier(0.34,1.56,0.64,1) both ${
                    i * 0.1 + 0.1
                  }s`,
                }}
              >
                <p className="font-headline text-7xl text-tomato mb-4 leading-none">
                  {step.num}
                </p>
                <h3 className="text-base font-black text-espresso uppercase tracking-[0.05em] mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-[#7A6A50] leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PERSONAS ─────────────────────────────────────────────────────── */}
      <section className="bg-cream px-4 py-20 md:py-24 border-b-5 border-espresso">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-espresso uppercase leading-none mb-1">
            Built for everyone
          </h2>
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-tomato uppercase leading-none mb-14">
            in the chain.
          </h2>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Roasters */}
            <div className="flex flex-col bg-tomato border-5 border-espresso rounded-xl p-8 shadow-flat-lg">
              <div className="mb-5 text-4xl">☕</div>
              <h3 className="font-headline text-3xl text-cream uppercase mb-3">
                Roasters
              </h3>
              <p className="mb-6 text-sm leading-relaxed text-cream/75">
                Access curated, quality-verified green coffee at prices that
                move in your favor as your community grows.
              </p>
              <ul className="flex-1 space-y-2.5">
                {[
                  "Hub-curated, pre-vetted lots",
                  "Sample before you commit",
                  "Tier pricing rewards group volume",
                  "Refunded if minimum isn't met",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-cream/90"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cream/20 text-[10px] font-black text-cream border border-cream/30">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/sign-up"
                className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-cream/80 transition-colors hover:text-cream"
              >
                Start buying <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Hub Owners — elevated */}
            <div className="flex flex-col bg-chalk border-5 border-espresso rounded-xl p-8 shadow-flat-lg lg:-translate-y-4">
              <div className="mb-5 text-4xl">🏛️</div>
              <h3 className="font-headline text-3xl text-espresso uppercase mb-3">
                Hub Owners
              </h3>
              <p className="mb-6 text-sm leading-relaxed text-[#7A6A50]">
                Build a curated catalog for your roaster community. Earn on
                volume. Set the quality bar. Run the campaigns.
              </p>
              <ul className="flex-1 space-y-2.5">
                {[
                  "Curate lots for your community",
                  "2% of gross on every campaign",
                  "Organize cupping events",
                  "Manage logistics and shipments",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-espresso"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-tomato text-[10px] font-black text-cream border border-espresso">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/for/hubs"
                className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-tomato transition-colors hover:text-honey"
              >
                Learn more <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Sellers / Farms */}
            <div className="flex flex-col bg-espresso border-5 border-espresso rounded-xl p-8 shadow-flat-tomato">
              <div className="mb-5 text-4xl">🌱</div>
              <h3 className="font-headline text-3xl text-cream uppercase mb-3">
                Sellers & Farms
              </h3>
              <p className="mb-6 text-sm leading-relaxed text-cream/60">
                List your lots directly to committed roaster demand. Know your
                volume before you ship. Get paid reliably.
              </p>
              <ul className="flex-1 space-y-2.5">
                {[
                  "Direct access to roaster buyers",
                  "Volume certainty before shipment",
                  "Stripe Connect payout on settlement",
                  "Transparent campaign tracking",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-cream/80"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cream/15 text-[10px] font-black text-cream border border-cream/20">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/for/sellers"
                className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-cream/60 transition-colors hover:text-cream"
              >
                Learn more <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="bg-espresso px-4 py-20 md:py-24 border-b-5 border-tomato">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-cream uppercase leading-none mb-14">
            What people are saying.
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="flex flex-col bg-chalk border-5 border-cream rounded-xl p-6 shadow-flat-tomato"
              >
                <p className="font-headline mb-3 text-5xl text-tomato leading-none">
                  "
                </p>
                <p className="flex-1 text-sm leading-relaxed text-espresso">
                  {t.quote}
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-cream border-2 border-espresso ${t.avatarBg}`}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-black text-espresso">{t.name}</p>
                    <p className="text-xs text-[#7A6A50]">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SPLIT CTA ────────────────────────────────────────────────────── */}
      <section className="bg-tomato px-4 py-20 md:py-24 border-b-5 border-espresso">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-headline text-[clamp(3rem,8vw,7rem)] text-cream uppercase leading-none mb-12 text-center">
            Ready to join?
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col bg-chalk border-5 border-espresso rounded-xl p-8 shadow-flat-lg">
              <div className="mb-4 text-3xl">☕</div>
              <h3 className="font-headline text-2xl text-espresso uppercase mb-2">
                I'm a roaster
              </h3>
              <p className="mb-6 flex-1 text-sm leading-relaxed text-[#7A6A50]">
                Browse open campaigns, join your hub, and start buying
                exceptional green coffee with your network.
              </p>
              <Link
                href="/auth/sign-up"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-tomato border-3 border-espresso text-sm font-bold uppercase tracking-[0.08em] text-cream shadow-flat-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-md active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
              >
                Create a free account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex flex-col bg-espresso border-5 border-espresso rounded-xl p-8 shadow-flat-cream">
              <div className="mb-4 text-3xl">🌱</div>
              <h3 className="font-headline text-2xl text-cream uppercase mb-2">
                I sell green coffee
              </h3>
              <p className="mb-6 flex-1 text-sm leading-relaxed text-cream/60">
                List your lots, reach committed roaster buyers, and get paid on
                settlement with predictable volume.
              </p>
              <Link
                href="/auth/sign-up"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-cream border-3 border-cream text-sm font-bold uppercase tracking-[0.08em] text-espresso hover:bg-fog transition-colors duration-100"
              >
                Request seller access
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="bg-espresso border-t-5 border-tomato px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <img
            src="/crowdroast_logo.svg"
            alt="CrowdRoast"
            className="h-10 brightness-0 invert opacity-60"
          />
          <p className="text-xs text-cream/40 font-medium">
            The specialty coffee marketplace. © 2026 CrowdRoast.
          </p>
        </div>
      </footer>
    </div>
  );
}
