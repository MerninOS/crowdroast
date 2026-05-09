'use client'

import * as React from 'react'

const FILLS = {
  honey: '#E8A530',
  sun: '#F2B834',
  sky: '#5BC8D5',
  cream: '#F8EFD0',
  matcha: '#5A7A3A',
} as const

interface OriginStickerProps {
  origin: string
  region: string
  color?: keyof typeof FILLS
  rotate?: number
  style?: React.CSSProperties
}

// Torn-edge origin sticker. Direct port from
// design/project/products/crowdroast/motifs.jsx — product-specific motif,
// stays in the CrowdRoast app rather than mernin-ui.
export function OriginSticker({
  origin,
  region,
  color = 'honey',
  rotate = -4,
  style,
}: OriginStickerProps) {
  return (
    <div
      style={{
        display: 'inline-block',
        transform: `rotate(${rotate}deg)`,
        background: FILLS[color],
        border: '3.5px solid #1C0F05',
        borderRadius: '14px 22px 16px 24px / 22px 14px 24px 16px',
        padding: '8px 16px 9px',
        boxShadow: '4px 4px 0 #1C0F05',
        fontFamily: 'var(--font-body)',
        color: '#1C0F05',
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          lineHeight: 0.95,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {origin}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          marginTop: 3,
          opacity: 0.85,
        }}
      >
        {region}
      </div>
    </div>
  )
}
