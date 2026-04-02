"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";

export default function ApplyHubPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/public-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_role: "hub_owner",
          email,
          company_name: companyName,
          contact_name: contactName,
          phone,
          notes,
        }),
      });

      if (res.status === 201) {
        router.push("/apply/success");
        return;
      }

      // Non-201 — surface the error without clearing the form
      const payload = await res.json().catch(() => ({}));
      setError(
        payload?.error || "Something went sideways. Give it another try."
      );
    } catch {
      setError("Something went sideways. Give it another try.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "bg-chalk border-3 border-espresso rounded-xl px-4 py-3 font-body text-base text-espresso shadow-[3px_3px_0_#1C0F05] outline-none focus:-translate-x-px focus:-translate-y-px focus:shadow-[4px_4px_0_#E8442A] focus:border-tomato transition-all duration-100 w-full";

  const labelClass =
    "block font-body text-sm font-bold uppercase tracking-[0.08em] text-espresso mb-1.5";

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      {/* ─── MAIN SECTION ─────────────────────────────────────────────────── */}
      <section className="flex-1 bg-cream px-4 py-20 md:py-28">
        <div className="mx-auto max-w-xl">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 bg-sun border-3 border-espresso rounded-pill px-4 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-espresso mb-8 shadow-flat-sm">
            ☕ Become a Hub Owner
          </div>

          {/* Headline */}
          <h1 className="font-display text-[clamp(3rem,8vw,4.5rem)] leading-[0.9] text-espresso uppercase mb-4">
            Build your coffee marketplace.
          </h1>

          {/* Subtext */}
          <p className="text-lg text-[#7A6A50] leading-relaxed mb-10 max-w-md">
            Hub owners curate the lots, set the quality bar, and earn on every
            campaign. Green buyers, consultants, café owners, toll roasters,
            coffee collectives — all welcome.
          </p>

          {/* Form card */}
          <div className="bg-chalk border-5 border-espresso rounded-xl p-8 shadow-flat-lg">
            <form onSubmit={onSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className={labelClass}>
                  Email <span className="text-tomato">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com"
                  className={inputClass}
                />
              </div>

              {/* Company Name */}
              <div>
                <label htmlFor="company-name" className={labelClass}>
                  Company Name
                  <span className="ml-1.5 text-[10px] font-medium normal-case tracking-normal text-[#7A6A50]">
                    optional
                  </span>
                </label>
                <input
                  id="company-name"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your roastery or collective"
                  className={inputClass}
                />
              </div>

              {/* Contact Name */}
              <div>
                <label htmlFor="contact-name" className={labelClass}>
                  Contact Name
                  <span className="ml-1.5 text-[10px] font-medium normal-case tracking-normal text-[#7A6A50]">
                    optional
                  </span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Who should we reach out to?"
                  className={inputClass}
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className={labelClass}>
                  Phone
                  <span className="ml-1.5 text-[10px] font-medium normal-case tracking-normal text-[#7A6A50]">
                    optional
                  </span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (512) 555-0100"
                  className={inputClass}
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className={labelClass}>
                  Tell us about your community
                  <span className="ml-1.5 text-[10px] font-medium normal-case tracking-normal text-[#7A6A50]">
                    optional
                  </span>
                </label>
                <textarea
                  id="notes"
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tell us about your community and why you'd make a great hub."
                  className={`${inputClass} resize-y`}
                />
              </div>

              {/* Inline error */}
              {error && (
                <div className="bg-tomato/10 border-3 border-tomato rounded-xl px-4 py-3 text-sm font-bold text-tomato">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-tomato text-cream border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] shadow-flat-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-md active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSubmitting ? "Sending..." : "Apply to Become a Hub"}
              </button>
            </form>
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
