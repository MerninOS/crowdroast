'use client'

import * as React from 'react'
import Image from 'next/image'
import { OriginSticker } from './motifs/OriginSticker'
import type { Lot } from '@/lib/types'

interface LotGalleryProps {
  lot: Lot
  /** Optional copy beat shown on the top-left status pills, e.g. 'Full Tier locked'. */
  tierStatusLabel?: string | null
}

// Hero image gallery — thumbnail-driven main image, lot # pill, status
// pills, OriginSticker, location chip. Direct port of the LotGallery in
// design/project/campaign/CommitForm.jsx. Empty-images fallback renders
// a brand placeholder so production lots without uploads still look on-brand.
export function LotGallery({ lot, tierStatusLabel }: LotGalleryProps) {
  const images = lot.images && lot.images.length > 0 ? lot.images : []
  const [activeIdx, setActiveIdx] = React.useState(0)
  const main = images[activeIdx] ?? null

  const elevationLabel =
    lot.altitude_min != null && lot.altitude_max != null
      ? `${lot.altitude_min}–${lot.altitude_max}m`
      : lot.altitude_min != null
        ? `${lot.altitude_min}m+`
        : null

  return (
    <div>
      {/* Main image */}
      <div
        style={{
          position: 'relative',
          border: '4px solid var(--color-espresso)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '6px 6px 0 var(--color-espresso)',
          aspectRatio: '4 / 3',
          background: 'var(--color-roast)',
        }}
      >
        {main ? (
          <Image
            src={main}
            alt={lot.title}
            fill
            sizes="(min-width: 1024px) 55vw, 100vw"
            style={{ objectFit: 'cover', display: 'block' }}
            priority
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--color-cream)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              textAlign: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(28px, 4vw, 48px)',
              lineHeight: 0.95,
              textTransform: 'uppercase',
              color: 'var(--color-espresso)',
            }}
          >
            {lot.title}
          </div>
        )}

        {/* Top-left: lot # + status pills */}
        <div
          style={{
            position: 'absolute',
            top: 18,
            left: 18,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <div
            style={{
              background: 'var(--color-cream)',
              color: 'var(--color-espresso)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 800,
              padding: '4px 12px',
              borderRadius: 8,
              border: '3px solid var(--color-espresso)',
              letterSpacing: '.08em',
            }}
          >
            LOT #{lot.id.slice(0, 8).toUpperCase()}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {lot.score != null && (
              <Pill variant="cream">Score · {lot.score}</Pill>
            )}
            {tierStatusLabel && (
              <Pill variant="positive">{tierStatusLabel}</Pill>
            )}
          </div>
        </div>

        {/* Bottom-right: origin sticker */}
        {lot.origin_country && (
          <div style={{ position: 'absolute', bottom: 18, right: 18 }}>
            <OriginSticker
              origin={lot.origin_country.toUpperCase()}
              region={(lot.region ?? '').toUpperCase()}
              color="sun"
              rotate={-5}
            />
          </div>
        )}

        {/* Bottom-left: location chip */}
        {(lot.region || elevationLabel) && (
          <div
            style={{
              position: 'absolute',
              bottom: 18,
              left: 18,
              background: 'rgba(28,15,5,.82)',
              color: 'var(--color-cream)',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '.04em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <PinIcon />
            {[lot.region, elevationLabel].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(5, images.length)}, 1fr)`,
            gap: 8,
            marginTop: 12,
          }}
        >
          {images.slice(0, 5).map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              style={{
                aspectRatio: '1 / 1',
                border:
                  activeIdx === i
                    ? '3px solid var(--color-tomato)'
                    : '3px solid var(--color-espresso)',
                borderRadius: 10,
                padding: 0,
                overflow: 'hidden',
                cursor: 'pointer',
                boxShadow:
                  activeIdx === i
                    ? '3px 3px 0 var(--color-tomato)'
                    : '2px 2px 0 var(--color-espresso)',
                background: 'var(--color-roast)',
                transition: 'all .12s var(--ease-snap)',
                position: 'relative',
              }}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="120px"
                style={{ objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Local pill ───────────────────────────────────────────────────────────────
// The merninos Pill exists, but it isn't yet exposed for inline-style overrides
// the way LotGallery needs. Keeping a tiny local one so the gallery overlay
// styling stays self-contained.
function Pill({
  variant,
  children,
}: {
  variant: 'cream' | 'positive'
  children: React.ReactNode
}) {
  const palette =
    variant === 'positive'
      ? { bg: 'var(--accent-positive)', fg: 'var(--accent-positive-fg)' }
      : { bg: 'var(--color-cream)', fg: 'var(--color-espresso)' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 9999,
        border: '2px solid var(--color-espresso)',
        background: palette.bg,
        color: palette.fg,
        fontWeight: 800,
        fontSize: 10,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
