'use client'

import * as React from 'react'
import Image from 'next/image'
import { FarmerStamp } from './motifs/FarmerStamp'
import type { Lot } from '@/lib/types'

interface FarmerCardProps {
  lot: Lot
  hubName?: string | null
}

// Full-bleed farmer dossier card — chalk surface, photo column on the
// left with FarmerStamp overlay, text column on the right with eyebrow,
// display-font headline, paragraph, and a 4-cell stat grid. Direct port
// of the farmer section in design/project/campaign/App.jsx.
//
// Schema gap: there's no dedicated farmerPhoto field on the lot today.
// We fall back to lot.images[1] (the second gallery image) when present
// — typically a producer/origin photo — and fully replace the photo
// with a brand-pattern panel when the lot has no images.
export function FarmerCard({ lot, hubName }: FarmerCardProps) {
  const farmerName =
    lot.farm ||
    lot.seller?.contact_name ||
    lot.seller?.company_name ||
    'Producer'
  const photoSrc = lot.images?.[1] ?? lot.images?.[0] ?? null

  const elevationLabel =
    lot.altitude_min != null && lot.altitude_max != null
      ? `${lot.altitude_min}–${lot.altitude_max}m`
      : lot.altitude_min != null
        ? `${lot.altitude_min}m+`
        : '—'

  const stats: Array<[string, string]> = [
    ['Process', lot.process || '—'],
    ['Variety', lot.variety || '—'],
    ['Cup score', lot.score != null ? String(lot.score) : '—'],
    ['Elevation', elevationLabel],
  ]

  const stampOrigin = (lot.region || lot.origin_country || '').slice(0, 24)
  const stampYear = lot.crop_year ? lot.crop_year.slice(-2) : ''

  return (
    <section
      className="cp-section"
      style={{
        padding: '56px 24px',
        background: 'var(--color-cream)',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div
          style={{
            background: 'var(--color-chalk)',
            border: '4px solid var(--color-espresso)',
            borderRadius: 24,
            boxShadow: '8px 8px 0 var(--color-espresso)',
            overflow: 'hidden',
          }}
        >
          <div
            className="cp-farmer-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
            }}
          >
            {/* Photo column */}
            <div
              style={{
                position: 'relative',
                minHeight: 460,
                background: 'var(--color-roast)',
                borderRight: '4px solid var(--color-espresso)',
              }}
            >
              {photoSrc ? (
                <Image
                  src={photoSrc}
                  alt={farmerName}
                  fill
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'repeating-linear-gradient(45deg, var(--color-roast) 0 24px, #2D170A 24px 48px)',
                  }}
                />
              )}
              <div style={{ position: 'absolute', bottom: 18, left: 18 }}>
                <FarmerStamp
                  name={farmerName.split(' ')[0] || 'Producer'}
                  origin={stampOrigin}
                  year={stampYear}
                  size={108}
                  rotate={-6}
                />
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: 18,
                  left: 18,
                  background: 'rgba(28,15,5,.82)',
                  color: 'var(--color-cream)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                The grower
              </div>
            </div>

            {/* Text column */}
            <div
              style={{
                padding: '36px 36px 32px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div
                className="eyebrow"
                style={{
                  color: 'var(--color-tomato)',
                  fontSize: 11,
                  letterSpacing: '.18em',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                  marginBottom: 8,
                }}
              >
                {farmerName}
                {hubName ? ` · ${hubName}` : ''}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(36px, 4vw, 56px)',
                  lineHeight: 0.9,
                  textTransform: 'uppercase',
                  color: 'var(--color-espresso)',
                }}
              >
                {lot.region ? (
                  <>
                    {lot.region}.<br />
                    {lot.crop_year ? `${lot.crop_year} crop.` : 'This crop.'}
                  </>
                ) : (
                  <>This crop.</>
                )}
              </div>
              <p
                style={{
                  fontSize: 15,
                  color: 'var(--color-espresso)',
                  lineHeight: 1.6,
                  marginTop: 18,
                  marginBottom: 0,
                  maxWidth: 540,
                }}
              >
                {lot.description ||
                  `${farmerName} sources this lot${lot.region ? ` from ${lot.region}` : ''}${lot.origin_country ? `, ${lot.origin_country}` : ''}. Every campaign on CrowdRoast pays the producer above the C-market — regardless of where the final tier lands.`}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 18,
                  marginTop: 22,
                  paddingTop: 22,
                  borderTop: '3px dashed var(--color-fog)',
                }}
              >
                {stats.map(([k, v]) => (
                  <div key={k}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '.14em',
                        textTransform: 'uppercase',
                        color: 'var(--fg2)',
                      }}
                    >
                      {k}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 22,
                        lineHeight: 1,
                        color: 'var(--color-espresso)',
                        marginTop: 6,
                      }}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .cp-farmer-grid { grid-template-columns: 1fr !important; }
          .cp-farmer-grid > div:first-child { border-right: none !important; border-bottom: 4px solid var(--color-espresso) !important; min-height: 320px !important; }
        }
      `}</style>
    </section>
  )
}
