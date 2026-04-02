# Spec: Landing Page Redesign

**Date:** 2026-04-01
**Status:** Approved

---

## Problem

The current landing page reads like a generic SaaS product page. The visual design is bland shadcn defaults. The copy is functional but not evocative. Most critically, it fails to communicate the *actual* value proposition: a specialty coffee group-buying model where small roasters unlock better prices together through trusted hub communities.

The three audiences (roasters/buyers, hub owners, sellers/farms) each have a distinct reason to care — the current page speaks to none of them compellingly.

---

## Goals

1. Create a visually distinctive landing page: lively, electric blues — almost cartoonish energy, but anchored as a software product. Think Stripe meets Blue Bottle meets Linear.
2. Make the group-buying mechanic viscerally clear — show the *momentum* of a campaign, not just describe it via a mocked animated campaign in the hero
3. Give each of the three personas (roasters, hub owners, sellers) equal weight and a reason to keep reading
4. Drive sign-up and marketplace exploration as primary CTAs

---

## Out of Scope

- Real-time live lot data from the database (static/mock data only)
- New auth flows or sign-up changes
- Mobile app / PWA concerns

---

## Sections & Content

### 1. Hero
- **Headline:** Centers the group-buying unlock — e.g. "The more roasters commit, the less everyone pays."
- **Subhead:** One sentence on hub-centric curation
- **Visual:** A mocked "campaign in progress" UI element — a stylized lot card with an animated commitment progress bar ticking up and a price tier visibly dropping as it fills. This is the hero's centrepiece, not a photo.
- **CTAs:** Primary = "Browse Open Lots", Secondary = "How It Works"

### 2. The Mechanic (How Group Pricing Works)
- Visual explanation of tier unlock — not 3 generic cards
- A simplified pricing tier diagram that animates: as the commitment bar fills, the $/kg price drops through visible tiers
- Copy anchors on "you only pay if the campaign succeeds"

### 3. Three Persona Callouts (equal weight)
Each gets a distinct visual treatment — not three identical cards:

| Persona | Hook |
|---------|------|
| **Roasters (Buyers)** | Curated quality + group pricing + hub expertise |
| **Hub Owners** | Tools to run campaigns, earn on volume, serve your community |
| **Sellers / Farms** | Direct access to committed roaster demand, predictable volume |

### 4. Social Proof / Trust
- 2–3 short testimonial-style quotes from fictional but credible personas
- Origin pin / map graphic to ground the "from-farm" story

### 5. Split CTA Footer
- Two distinct paths: "I'm a roaster" → sign-up, "I sell green coffee" → seller access request
- Not a single generic "Get Started"

---

## Design Direction

- **Palette:** Lively, electric blues as the dominant hue — almost cartoonish saturation, but disciplined enough to read as a software product. Cobalt/indigo hero, white and near-white content sections, blue accents throughout. No warm browns or espresso tones.
- **Typography:** Avoid Inter/Roboto/system fonts. An editorial or geometric display font for headings (bold, high x-height, personality). Clean geometric sans for body. Fonts loaded via `next/font`.
- **Motion:** The campaign progress bar animation is the key hero interaction. One orchestrated page-load stagger sequence. No scattered micro-animations.
- **Avoid:** Purple gradients, muted icon-in-a-circle cards as primary elements, hero that's just a coffee bean photo.

---

## Technical Notes

- `app/page.tsx` is a server component — keep it that way
- All data is static/mock; no new API routes
- Existing `SiteHeader` component is preserved
- `frontend-design` plugin drives implementation
- Tailwind + shadcn/ui available; new fonts via `next/font`
- Animation via CSS keyframes or Tailwind `animate-*`; no new animation libraries unless trivially small

---

## Acceptance Criteria

- [ ] Page has a lively electric-blue palette with clear software-product polish
- [ ] Hero contains a mocked animated campaign card (progress bar + tier price drop)
- [ ] Group pricing mechanic is communicated visually, not just in copy
- [ ] All three personas (roaster, hub owner, seller) are addressed with equal prominence
- [ ] Two differentiated CTAs at the bottom (roaster path vs. seller path)
- [ ] No generic icon-in-a-muted-div cards as primary design elements
- [ ] `app/page.tsx` remains a server component
- [ ] No regressions to existing auth routes or marketplace links
