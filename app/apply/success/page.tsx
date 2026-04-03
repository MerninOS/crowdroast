import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ArrowLeft } from "lucide-react";

export default function ApplySuccessPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      {/* ─── MAIN ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 bg-cream px-4 py-20 md:py-28 border-b-5 border-espresso">
        <div className="mx-auto max-w-2xl flex flex-col items-center text-center">

          {/* Big ✦ symbol in sun */}
          <div
            className="mb-8 flex items-center justify-center w-24 h-24 bg-sun border-5 border-espresso rounded-xl shadow-flat-lg text-espresso"
            style={{ animation: "fadeUp 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}
          >
            <span className="font-headline text-5xl leading-none">✦</span>
          </div>

          {/* Headline */}
          <h1
            className="font-display text-[clamp(3rem,8vw,5rem)] leading-[0.9] text-espresso uppercase mb-6"
            style={{ animation: "fadeUp 0.45s ease both 0.08s" }}
          >
            You&rsquo;re in the{" "}
            <span className="text-tomato">queue.</span>
          </h1>

          {/* Confirmation card */}
          <div
            className="w-full bg-chalk border-5 border-espresso rounded-xl p-8 shadow-flat-lg mb-10"
            style={{ animation: "fadeUp 0.45s ease both 0.16s" }}
          >
            <p className="text-lg text-espresso font-bold mb-3">
              We got it. Application received.
            </p>
            <p className="text-[#7A6A50] leading-relaxed">
              We&rsquo;ll review your application and get back to you within the
              next few business days. Keep an eye on your inbox.
            </p>
          </div>

          {/* Back home button */}
          <div style={{ animation: "fadeUp 0.45s ease both 0.24s" }}>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-tomato text-cream border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] shadow-flat-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-md active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to homepage
            </Link>
          </div>
        </div>
      </main>

      {/* ─── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="bg-espresso border-t-5 border-tomato px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <img
            src="/crowdroast_logo.png"
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
