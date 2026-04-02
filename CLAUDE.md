# Mernin' Software Design System

> Drop this file into any Mernin' software repo. Claude must follow these guidelines
> whenever building, modifying, or reviewing frontend UI.

---

## Brand Personality

Mernin' and it's softwares (CoffeeOS, CrowdRoast, and Soluable) is **loud, warm, and a little unhinged in the best way**. Think: retro diner meets streetwear meets specialty coffee nerd. The visual language is bold, chunky, comic-book-inflected — but still clean and intentional underneath. Software built under the Mernin' umbrella should feel like that too.

Key adjectives: **bold, chunky, retro, warm, playful, confident, slightly irreverent**

The single most important rule: **Mernin' software should never look like generic SaaS.** If it could pass for a Stripe or Linear clone, start over.

---

## Color Palette

```css
:root {
  /* --- Core Brand --- */
  --color-tomato: #e8442a; /* primary brand red — hero backgrounds, marquee bars, loud accents */
  --color-cream: #f5f0d8; /* primary background — warm off-white, not pure white */
  --color-espresso: #1c0f05; /* primary text, outlines, thick borders */
  --color-sun: #f5c842; /* yellow — starburst badges, highlights, secondary accent */
  --color-sky: #5bc8d5; /* teal/sky — product packaging color, info states */

  /* --- Extended --- */
  --color-chalk: #fdfaf0; /* elevated surfaces, card backgrounds */
  --color-roast: #3b1f0a; /* dark brown — logo fill, secondary dark text */
  --color-honey: #e8913a; /* warm orange — hover states, accent fills */
  --color-matcha: #5a7a3a; /* success / in-stock */
  --color-fog: #d8d0b8; /* borders, dividers, muted backgrounds */

  /* --- Semantic Tokens --- */
  --bg-primary: var(--color-cream);
  --bg-elevated: var(--color-chalk);
  --bg-loud: var(--color-tomato);
  --bg-inverse: var(--color-espresso);
  --text-primary: var(--color-espresso);
  --text-muted: #7a6a50;
  --text-inverse: var(--color-cream);
  --accent-primary: var(--color-tomato);
  --accent-secondary: var(--color-sun);
  --border-default: var(--color-fog);
  --border-bold: var(--color-espresso);
}

[data-theme="dark"] {
  --bg-primary: var(--color-espresso);
  --bg-elevated: var(--color-roast);
  --text-primary: var(--color-cream);
  --text-muted: #a09070;
  --border-default: #2a1a0a;
  --border-bold: var(--color-tomato);
}
```

---

## Typography

Mernin' Brands uses **two very intentional font roles**:

1. **Header / Display** — big, playful, chunky. This is where **Adore Cats** comes in. Use it for hero headlines, section headers, and loud callouts that need instant personality.
2. **Body/UI** — clean, modern, readable. This is where **Cal Sans** comes in for body copy, labels, nav, and product UI.

```css
@import url("https://fonts.googleapis.com/css2?family=Cal+Sans&display=swap");

@font-face {
  font-family: "Adore Cats";
  src:
    url("/fonts/AdoreCats.otf") format("opentype"),
    url("/fonts/AdoreCats.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-display:
    "Adore Cats", "Fredoka", cursive; /* playful, loud — hero text */
  --font-headline:
    "Adore Cats", "Fredoka", cursive; /* section headers and statements */
  --font-body: "Cal Sans", system-ui, sans-serif; /* body, UI, labels */
  --font-mono: "JetBrains Mono", monospace;
}
```

> **Adore Cats** should be treated as a display-first font. It carries the bubbly, character-heavy energy Mernin' wants in headers.
> **Cal Sans** keeps the product feeling crisp and modern underneath the louder brand moments.

### Type Rules

- **Hero headlines**: `--font-display`, massive size (4rem–8rem), with a thick `text-shadow` or `-webkit-text-stroke` outline to recreate the comic-book sticker look.
- **Section statements / headers**: `--font-headline`, large and bold (2.5rem–5rem). Keep them short and punchy so Adore Cats stays readable.
- **Labels / UI nav**: `--font-body`, `font-weight: 400`, uppercase, `letter-spacing: 0.08em`.
- **Body copy**: `--font-body`, `font-weight: 400`, normal case.
- **Use Adore Cats sparingly**: headlines, headers, callouts. Do not use it for dense paragraphs, tables, or long-form UI.
- **Never use Playfair, Georgia, or any serif** — Mernin' is not editorial. It's bold and graphic.
- **Never use thin weights** (300 or below).

### The Sticker / Outline Effect

A signature Mernin' pattern: bubbly white text with a thick espresso outline, as if it were a sticker slapped on the page.

```css
.sticker-text {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--color-cream);
  -webkit-text-stroke: 6px var(--color-espresso);
  paint-order: stroke fill;
  /* Or with text-shadow for wider compat: */
  text-shadow:
    3px 3px 0 var(--color-espresso),
    -3px 3px 0 var(--color-espresso),
    3px -3px 0 var(--color-espresso),
    -3px -3px 0 var(--color-espresso),
    5px 5px 0 var(--color-espresso);
}
```

---

## Borders & Outlines

Mernin' uses **thick, visible borders** everywhere. This is not a subtle, minimalist brand.

```css
:root {
  --border-width-default: 2px;
  --border-width-bold: 3px;
  --border-width-chunky: 4px;
  --border-width-comic: 5px; /* product cards, hero elements */

  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 32px;
  --radius-pill: 9999px;
  --radius-bubble: 40px; /* the chunky bubbly card corners */
}

/* Standard card border */
.card {
  border: var(--border-width-comic) solid var(--color-espresso);
  border-radius: var(--radius-lg);
}

/* Product card — comic book panel style */
.card-product {
  border: 5px solid var(--color-espresso);
  border-radius: var(--radius-lg);
  background: var(--color-chalk);
  box-shadow: 6px 6px 0px var(--color-espresso); /* flat offset shadow — no blur */
}
```

### The Flat Offset Shadow

This is the defining layout detail. Not a blurred drop shadow — a **hard offset shadow** that looks printed/sticker-like.

```css
/* Use these shadow tokens everywhere */
--shadow-flat-sm: 3px 3px 0px var(--color-espresso);
--shadow-flat-md: 5px 5px 0px var(--color-espresso);
--shadow-flat-lg: 8px 8px 0px var(--color-espresso);

/* On tomato backgrounds, shadow in espresso */
/* On cream/chalk backgrounds, shadow in espresso */
/* On espresso backgrounds, shadow in tomato or sun */
```

---

## Spacing & Layout

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;
  --space-24: 6rem;

  --container-max: 1280px;
}
```

### Layout Principles

- **Full-bleed sections alternate**: tomato → cream → tomato → cream. The color blocks are structural, not decorative.
- **Marquee/ticker bars** are a core UI pattern — use for announcements, status messages, fun facts. White text on tomato background. Always scrolling.
- **Product cards** are comic-book panels: bold border, hard shadow, no soft drop shadows.
- **Don't center everything** — large type should break grids, overlap sections, and feel like it was slapped on.
- Use **big, statement typography** to fill space instead of padding everything with content.

---

## Component Patterns

### Marquee Bar

Signature Mernin' element. Use for alerts, announcements, fun rotating text.

```css
.marquee-bar {
  background: var(--color-tomato);
  color: var(--color-cream);
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 10px 0;
  overflow: hidden;
  white-space: nowrap;
}
.marquee-inner {
  display: inline-flex;
  gap: 2.5rem;
  animation: ticker 20s linear infinite;
}
@keyframes ticker {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
/* Separator between items: use  ✦  or  ✸  or  *  */
```

### Starburst Badge

The sunburst/starburst shape used for "FULL OF FLAVOUR", "DELICIOUS!", "SOLD OUT" callouts.

```css
.starburst {
  background: var(--color-sun);
  color: var(--color-espresso);
  font-family: var(--font-body);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: center;
  padding: 18px;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  clip-path: polygon(
    50% 0%,
    61% 35%,
    98% 35%,
    68% 57%,
    79% 91%,
    50% 70%,
    21% 91%,
    32% 57%,
    2% 35%,
    39% 35%
  );
}
```

### Buttons

Big, chunky, outlined. Use the flat offset shadow.

```css
.btn-primary {
  background: var(--color-tomato);
  color: var(--color-cream);
  border: 3px solid var(--color-espresso);
  border-radius: var(--radius-pill);
  padding: 12px 28px;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  box-shadow: var(--shadow-flat-sm);
  transition:
    transform 0.1s,
    box-shadow 0.1s;
}
.btn-primary:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--shadow-flat-md);
}
.btn-primary:active {
  transform: translate(3px, 3px);
  box-shadow: none;
}

.btn-outline {
  background: transparent;
  color: var(--color-espresso);
  border: 3px solid var(--color-espresso);
  border-radius: var(--radius-pill);
  /* same padding/font/shadow */
}
.btn-outline:hover {
  background: var(--color-espresso);
  color: var(--color-cream);
}
```

### Cards

```css
/* Product card — the main pattern */
.card-product {
  background: var(--color-chalk);
  border: 5px solid var(--color-espresso);
  border-radius: var(--radius-lg);
  box-shadow: 6px 6px 0 var(--color-espresso);
  padding: var(--space-6);
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}
.card-product:hover {
  transform: translate(-3px, -3px);
  box-shadow: 9px 9px 0 var(--color-espresso);
}

/* Info/feature card */
.card-feature {
  background: var(--color-tomato);
  color: var(--color-cream);
  border: 4px solid var(--color-espresso);
  border-radius: var(--radius-lg);
  box-shadow: 5px 5px 0 var(--color-espresso);
  padding: var(--space-6);
}
```

### Inputs

```css
.input {
  background: var(--bg-elevated);
  border: 3px solid var(--color-espresso);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-family: var(--font-body);
  font-size: 1rem;
  color: var(--text-primary);
  box-shadow: 3px 3px 0 var(--color-espresso);
  outline: none;
  transition:
    box-shadow 0.1s,
    transform 0.1s;
}
.input:focus {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--color-tomato);
  border-color: var(--color-tomato);
}
```

### Status Badges

```css
.badge {
  font-family: var(--font-body);
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--color-espresso);
}
.badge-new {
  background: var(--color-tomato);
  color: var(--color-cream);
}
.badge-sold-out {
  background: var(--color-espresso);
  color: var(--color-cream);
}
.badge-hot {
  background: var(--color-sun);
  color: var(--color-espresso);
}
.badge-fresh {
  background: var(--color-matcha);
  color: var(--color-cream);
}
```

---

## Iconography

- Use **Lucide** icons, stroke width `2`.
- Icons should be thick and legible — match the chunky visual weight of the brand.
- Avoid decorative icon overuse. Mernin' leads with type, not icons.
- Starburst and sunburst shapes (SVG or clip-path) > generic icons for callouts.

---

## Motion & Animation

Mernin' has energy. Animations should be snappy and physical, not silky/smooth.

```css
:root {
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoot = life */
  --ease-snap: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 120ms;
  --duration-base: 220ms;
  --duration-slow: 380ms;
}
```

- **Hover on cards/buttons**: translate up-left + increase shadow. Like picking something up off a table.
- **Active/click**: translate down-right + remove shadow. Like pressing a stamp down.
- **Entrance**: staggered slide-up with slight bounce (`--ease-bounce`).
- **Marquees**: constant, smooth, `linear` — never pausing.
- Always respect `prefers-reduced-motion`.

---

## Tailwind Config

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        tomato: "#E8442A",
        cream: "#F5F0D8",
        espresso: "#1C0F05",
        sun: "#F5C842",
        sky: "#5BC8D5",
        chalk: "#FDFAF0",
        roast: "#3B1F0A",
        honey: "#E8913A",
        matcha: "#5A7A3A",
        fog: "#D8D0B8",
      },
      fontFamily: {
        display: ["Adore Cats", "Fredoka", "cursive"],
        headline: ["Adore Cats", "Fredoka", "cursive"],
        body: ["Cal Sans", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        "flat-sm": "3px 3px 0px #1C0F05",
        "flat-md": "5px 5px 0px #1C0F05",
        "flat-lg": "8px 8px 0px #1C0F05",
      },
      borderWidth: {
        3: "3px",
        4: "4px",
        5: "5px",
      },
    },
  },
};
```

---

## Voice & Microcopy

Mernin' copy is **direct, punchy, and occasionally silly**. The UI should talk like the brand does.

| Context     | ❌ Generic         | ✅ Mernin'                        |
| ----------- | ------------------ | --------------------------------- |
| Empty state | No results found   | Nothing here yet. Check back soon |
| Loading     | Loading...         | Brewing...                        |
| Error       | An error occurred  | Something went sideways           |
| Success     | Saved successfully | Done. You're good.                |
| CTA         | Submit             | Let's Go                          |
| 404         | Page not found     | You got lost. Happens to the best |

---

## What NOT to Do

- ❌ **No blurred/soft drop shadows** — use flat offset shadows only
- ❌ **No thin fonts** — nothing lighter than `font-weight: 400`
- ❌ **No serif fonts** (Playfair, Georgia, etc.) — wrong vibe entirely
- ❌ **No cool grays or blues** as primary surfaces — cream and warm whites only
- ❌ **No purple gradients or standard SaaS blue** — this is not Linear
- ❌ **No timid borders** — if you're using a border, make it 3px minimum and espresso-colored
- ❌ **No centered layouts as default** — break grids, let type overflow, be graphic
- ❌ **No pure #FFFFFF white** or **pure #000000 black** — use `--color-cream` and `--color-espresso`
- ❌ **No generic button styles** — buttons need the flat shadow and thick border
- ❌ **No sterile empty states** — give them personality

---

## Quick Reference

| Token              | Value            | Use                                   |
| ------------------ | ---------------- | ------------------------------------- |
| `--color-tomato`   | `#E8442A`        | Hero backgrounds, primary accent      |
| `--color-cream`    | `#F5F0D8`        | Page backgrounds                      |
| `--color-espresso` | `#1C0F05`        | Text, borders, shadows                |
| `--color-sun`      | `#F5C842`        | Starbursts, badges, secondary accent  |
| `--color-sky`      | `#5BC8D5`        | Product packaging, info states        |
| `--font-display`   | Adore Cats       | Hero, big statements, bubbly text     |
| `--font-headline`  | Adore Cats       | Section headers, bold callouts        |
| `--font-body`      | Cal Sans         | Body copy, UI labels, nav             |
| `--shadow-flat-md` | `5px 5px 0 #...` | Cards, buttons — the signature shadow |
| `--radius-lg`      | `20px`           | Cards, panels                         |
| `--radius-pill`    | `9999px`         | Buttons, badges                       |

---

_Roasted with 🤠 in Austin, TX. If it doesn't look bold enough, make it bigger._
