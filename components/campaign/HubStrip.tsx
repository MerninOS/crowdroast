'use client'

import * as React from 'react'

interface HubStripProps {
  hubName?: string | null
}

// Espresso section that explains hub-credited pricing — direct port of
// the dark strip in design/project/campaign/App.jsx. The headline plays
// off a sun-colored span ("our margin"), and the body describes how
// CrowdRoast absorbs the tier discount instead of squeezing the producer.
export function HubStrip({ hubName }: HubStripProps) {
  return (
    <section
      style={{
        background: 'var(--color-espresso)',
        color: 'var(--color-cream)',
        padding: '48px 28px',
        borderTop: '5px solid var(--color-espresso)',
      }}
    >
      <div
        className="cp-hub-grid"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
          gap: 32,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            className="eyebrow"
            style={{
              color: 'var(--color-sun)',
              fontSize: 11,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            Hub-credited pricing
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(32px, 3.6vw, 48px)',
              lineHeight: 0.92,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            The discount comes
            <br />
            out of <span style={{ color: 'var(--color-sun)' }}>our margin.</span>
            <br />
            Not the producer&apos;s.
          </h2>
        </div>

        <div>
          <p
            style={{
              fontSize: 14.5,
              opacity: 0.85,
              lineHeight: 1.6,
              marginTop: 0,
              marginBottom: 18,
            }}
          >
            Every tier discount on this lot is absorbed by{' '}
            {hubName ? <b>{hubName}</b> : <b>your hub</b>}, not the producer.
            They&apos;re paid the agreed price the moment the campaign closes —
            full stop. That&apos;s the deal CrowdRoast enforces on every
            campaign.
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .cp-hub-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
