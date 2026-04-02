import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ArrowRight } from "lucide-react";

const marqueeItems = [
  "Direct access to specialty roasters",
  "✦",
  "Know your volume before you ship",
  "✦",
  "Get paid on settlement",
  "✦",
  "No chasing invoices",
  "✦",
  "Transparent campaign tracking",
  "✦",
];

const steps = [
  {
    num: "01",
    title: "List your lot",
    body: "Submit your green coffee details — origin, process, score, and pricing tiers. Your hub owner reviews and publishes it to their community.",
  },
  {
    num: "02",
    title: "Roasters commit",
    body: "The campaign runs until deadline. Roasters pledge their volume. You watch committed pounds grow in real time.",
  },
  {
    num: "03",
    title: "Settlement pays you out",
    body: "When the deadline hits and minimums are met, Stripe Connect sends your payout automatically. No invoices, no follow-ups.",
  },
];

const valueCards = [
  {
    icon: "📦",
    title: "Volume certainty",
    body: "Know how many pounds are committed before you finalize shipping logistics. No more guessing.",
    bg: "bg-chalk",
    text: "text-espresso",
    muted: "text-[#7A6A50]",
  },
  {
    icon: "☕",
    title: "Specialty buyers",
    body: "Reach quality-focused roasters who care about origin, process, and score — not just price.",
    bg: "bg-tomato",
    text: "text-cream",
    muted: "text-cream/75",
  },
  {
    icon: "💳",
    title: "Automatic payouts",
    body: "Stripe Connect handles payment distribution. You get paid on settlement, not when you remember to invoice.",
    bg: "bg-chalk",
    text: "text-espresso",
    muted: "text-[#7A6A50]",
  },
  {
    icon: "📊",
    title: "Campaign transparency",
    body: "Real-time visibility into committed volume, tier progress, and deadline status for every lot you list.",
    bg: "bg-tomato",
    text: "text-cream",
    muted: "text-cream/75",
  },
];

export default function SellersPage() {
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
            🌱 Farms &amp; Sellers
          </div>

          <div className="max-w-4xl">
            <h1
              className="font-display text-[clamp(3.5rem,8vw,6rem)] leading-[0.9] text-espresso uppercase mb-4"
              style={{ animation: "fadeUp 0.45s ease both 0.08s" }}
            >
              Know your volume{" "}
              <span className="text-tomato">before you ship.</span>
            </h1>
            <p
              className="text-lg text-[#7A6A50] max-w-2xl leading-relaxed mb-10"
              style={{ animation: "fadeUp 0.45s ease both 0.16s" }}
            >
              List your lots to committed specialty roasters. Campaigns run
              until minimum volume is met — then settlement pays you out
              automatically. No guesswork, no invoice chasing.
            </p>

            <div
              className="flex flex-wrap gap-3 mb-14"
              style={{ animation: "fadeUp 0.45s ease both 0.24s" }}
            >
              <Link
                href="/apply/seller"
                className="inline-flex items-center gap-2 bg-tomato text-cream border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] shadow-flat-md hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-lg active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
              >
                Apply as a Seller
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 text-espresso border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] hover:bg-espresso hover:text-cream transition-all duration-100"
              >
                See How It Works
              </a>
            </div>

            {/* Stats */}
            <div
              className="flex flex-wrap gap-4"
              style={{ animation: "fadeUp 0.45s ease both 0.34s" }}
            >
              {[
                { value: "Committed", label: "Volume before you ship" },
                { value: "Automatic", label: "Settlement via Stripe" },
                { value: "0", label: "Surprise minimum shortfalls" },
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
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="bg-tomato px-4 py-20 md:py-24 border-b-5 border-espresso"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-cream uppercase leading-none mb-1">
            List it. Wait for commitment.
          </h2>
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-espresso uppercase leading-none mb-10">
            Get paid.
          </h2>

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

      {/* ─── VALUE CARDS ──────────────────────────────────────────────────── */}
      <section className="bg-cream px-4 py-20 md:py-24 border-b-5 border-espresso">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-espresso uppercase leading-none mb-1">
            Built for sellers who want
          </h2>
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-tomato uppercase leading-none mb-14">
            certainty.
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {valueCards.map((card, i) => (
              <div
                key={card.title}
                className={`${card.bg} border-5 border-espresso rounded-xl p-6 shadow-flat-lg`}
                style={{
                  animation: `fadeUp 0.5s cubic-bezier(0.34,1.56,0.64,1) both ${
                    i * 0.08 + 0.1
                  }s`,
                }}
              >
                <div className="mb-4 text-3xl">{card.icon}</div>
                <h3
                  className={`font-headline text-xl uppercase mb-3 ${card.text}`}
                >
                  {card.title}
                </h3>
                <p className={`text-sm leading-relaxed ${card.muted}`}>
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIAL ──────────────────────────────────────────────────── */}
      <section className="bg-espresso px-4 py-20 md:py-24 border-b-5 border-tomato">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-cream uppercase leading-none mb-14">
            From a seller.
          </h2>

          <div className="bg-chalk border-5 border-cream rounded-xl p-8 shadow-[5px_5px_0_#E8442A]">
            <p className="font-headline mb-3 text-5xl text-tomato leading-none">
              "
            </p>
            <p className="text-base leading-relaxed text-espresso max-w-2xl mb-8">
              As an importer, knowing committed volume before we finalize
              shipping logistics is a game changer. CrowdRoast gives us that
              certainty without the usual back-and-forth.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-cream border-2 border-espresso bg-matcha">
                JM
              </div>
              <div>
                <p className="text-sm font-black text-espresso">João M.</p>
                <p className="text-xs text-[#7A6A50]">
                  Director, Altura Green Coffee
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA SECTION ──────────────────────────────────────────────────── */}
      <section className="bg-tomato px-4 py-20 md:py-24 border-b-5 border-espresso">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-headline text-[clamp(3rem,8vw,6rem)] text-cream uppercase leading-none mb-12 text-center">
            Ready to list your coffee?
          </h2>

          <div className="bg-chalk border-5 border-espresso rounded-xl p-8 shadow-flat-lg">
            <div className="mb-4 text-4xl text-center">🌱</div>
            <h3 className="font-headline text-2xl text-espresso uppercase mb-3 text-center">
              I sell green coffee
            </h3>
            <p className="text-sm leading-relaxed text-[#7A6A50] mb-8 text-center max-w-md mx-auto">
              Exporters, importers, and farm-direct sellers. If you have quality
              lots and want committed buyers before you ship, this is your
              platform.
            </p>
            <Link
              href="/apply/seller"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-tomato border-3 border-espresso text-sm font-bold uppercase tracking-[0.08em] text-cream shadow-flat-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-md active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
            >
              Apply as a Seller
              <ArrowRight className="h-4 w-4" />
            </Link>
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
