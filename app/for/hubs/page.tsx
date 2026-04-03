import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ArrowRight } from "lucide-react";

const marqueeItems = [
  "Curate exceptional lots",
  "✦",
  "Host cupping events",
  "✦",
  "Build your roaster community",
  "✦",
  "Earn on every campaign",
  "✦",
  "Toll roasters & collectives welcome",
  "✦",
];

const steps = [
  {
    num: "01",
    title: "Source & cup the lots",
    body: "You find exceptional green coffee, cup it, and decide what your community will love. Your taste, your standard.",
  },
  {
    num: "02",
    title: "List & run campaigns",
    body: "Publish lots to your hub, invite your roasters, and watch commitments roll in. Cupping events convert tasters into buyers.",
  },
  {
    num: "03",
    title: "Collect your cut",
    body: "When the campaign settles, you earn 2% of gross. The more your community commits, the more everyone wins — including you.",
  },
];

const valueCards = [
  {
    icon: "☕",
    title: "Curated catalog",
    body: "Your hub, your taste. You vet every lot before it touches your community's inbox.",
    bg: "bg-chalk",
    text: "text-espresso",
    muted: "text-[#7A6A50]",
  },
  {
    icon: "🎯",
    title: "Cupping events",
    body: "Host tasting sessions, score lots, and convert attendees into committed buyers — all in one place.",
    bg: "bg-tomato",
    text: "text-cream",
    muted: "text-cream/75",
  },
  {
    icon: "📦",
    title: "Logistics tools",
    body: "Track samples, manage shipments, and keep your community informed at every step.",
    bg: "bg-chalk",
    text: "text-espresso",
    muted: "text-[#7A6A50]",
  },
  {
    icon: "🏛️",
    title: "Community first",
    body: "Whether you're a solo buyer or running a collective of 20 roasters, CrowdRoast scales with your community.",
    bg: "bg-tomato",
    text: "text-cream",
    muted: "text-cream/75",
  },
];

export default function HubsPage() {
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
            🏛️ Hub Owners
          </div>

          <div className="max-w-4xl">
            <h1
              className="font-display text-[clamp(3.5rem,8vw,5rem)] leading-[0.9] text-espresso uppercase mb-4"
              style={{ animation: "fadeUp 0.45s ease both 0.08s" }}
            >
              Bring the best coffee{" "}
              <span className="text-tomato">To your community.</span>
            </h1>
            <p
              className="text-lg text-[#7A6A50] max-w-2xl leading-relaxed mb-10"
              style={{ animation: "fadeUp 0.45s ease both 0.16s" }}
            >
              Cup it. Curate it. Commit together. Hub owners set the quality
              bar, run the campaigns, and earn on every lot their community
              buys.
            </p>

            <div
              className="flex flex-wrap gap-3 mb-14"
              style={{ animation: "fadeUp 0.45s ease both 0.24s" }}
            >
              <Link
                href="/apply/hub"
                className="inline-flex items-center gap-2 bg-tomato text-cream border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] shadow-flat-md hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-lg active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
              >
                Apply to Become a Hub
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
                { value: "2%", label: "Earned on gross per campaign" },
                { value: "You", label: "Set the quality bar" },
                { value: "Zero", label: "Upfront cost to run a hub" },
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
            Cup. Curate.
          </h2>
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-espresso uppercase leading-none mb-10">
            Collect.
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
            Everything you need
          </h2>
          <h2 className="font-headline text-[clamp(2.5rem,6vw,5.5rem)] text-tomato uppercase leading-none mb-14">
            to run a hub.
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
            From a hub owner.
          </h2>

          <div className="bg-chalk border-5 border-cream rounded-xl p-8 shadow-[5px_5px_0_#E8442A]">
            <p className="font-headline mb-3 text-5xl text-tomato leading-none">
              "
            </p>
            <p className="text-base leading-relaxed text-espresso max-w-2xl mb-8">
              Running cupping events through the platform and converting those
              sessions into commitments in the same day changed everything about
              how I run my hub.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-cream border-2 border-espresso bg-sky">
                PS
              </div>
              <div>
                <p className="text-sm font-black text-espresso">Priya S.</p>
                <p className="text-xs text-[#7A6A50]">
                  Hub Operator, Pacific Rim Coffee Guild
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
            Ready to build your hub?
          </h2>

          <div className="bg-chalk border-5 border-espresso rounded-xl p-8 shadow-flat-lg">
            <div className="mb-4 text-4xl text-center">🏛️</div>
            <h3 className="font-headline text-2xl text-espresso uppercase mb-3 text-center">
              I run a roaster community
            </h3>
            <p className="text-sm leading-relaxed text-[#7A6A50] mb-8 text-center max-w-md mx-auto">
              Green buyers, consultants, café owners, toll roasters, coffee
              collectives. If you curate coffee for a community, this is built
              for you.
            </p>
            <Link
              href="/apply/hub"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-tomato border-3 border-espresso text-sm font-bold uppercase tracking-[0.08em] text-cream shadow-flat-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-md active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
            >
              Apply to Become a Hub
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
