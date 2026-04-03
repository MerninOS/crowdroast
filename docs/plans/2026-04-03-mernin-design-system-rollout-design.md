# Design: Mernin Design System Rollout

> **Spec:** specs/mernin-design-system-rollout.md

## Approach

CSS variables first, components second (Approach 3).

1. Update `globals.css` CSS variables → all 11 shadcn components inherit Mernin colors immediately
2. Update `dashboard/layout.tsx` → cream background, Mernin fonts
3. Build 4 custom Mernin components (Card, Button, Badge, Input)
4. Sweep pages swapping imports for those 4 components
5. Verify each area (auth, dashboard, browse)

## Concerns

| Concern | Assessment |
|---------|-----------|
| Breaking changes | Landing pages use hardcoded Tailwind classes, not CSS vars — safe |
| Performance | No new dependencies or API changes |
| Accessibility | Fix contrast issues as they come up |
| Testing | Visual verification across all areas at desktop + mobile |
| Rollback | Easy — revert CSS vars and import swaps |
| Security | N/A — purely cosmetic |
