'use client'

import * as React from 'react'

interface FarmerStampProps {
  name: string
  origin?: string
  year?: string
  size?: number
  rotate?: number
  style?: React.CSSProperties
}

// Circular passport-style farmer stamp. Direct port from
// design/project/products/crowdroast/motifs.jsx. Curved label uses
// SVG textPath; the inner disc holds a mountain glyph + farmer name.
export function FarmerStamp({
  name,
  origin = '',
  year = '',
  size = 130,
  rotate = -6,
  style,
}: FarmerStampProps) {
  const id = React.useId()
  const curveLabel =
    `★ FARMER${origin ? ` · ${origin.toUpperCase()}` : ''}${year ? ` · ${year}` : ''} ★`
  return (
    <div style={{ display: 'inline-block', transform: `rotate(${rotate}deg)`, ...style }}>
      <svg width={size} height={size} viewBox="0 0 140 140">
        <defs>
          <path
            id={id}
            d="M 70 70 m -54 0 a 54 54 0 1 1 108 0 a 54 54 0 1 1 -108 0"
          />
        </defs>
        <circle
          cx="70"
          cy="70"
          r="64"
          fill="none"
          stroke="#1C0F05"
          strokeWidth="3"
          strokeDasharray="3 4"
        />
        <circle cx="70" cy="70" r="58" fill="#F8EFD0" stroke="#1C0F05" strokeWidth="3.5" />
        <text
          fontFamily="var(--font-headline)"
          fontSize="10.5"
          fontWeight="800"
          fill="#1C0F05"
          letterSpacing="2"
        >
          <textPath href={`#${id}`} startOffset="2%">
            {curveLabel}
          </textPath>
        </text>
        <circle cx="70" cy="78" r="32" fill="#D93A1F" stroke="#1C0F05" strokeWidth="3" />
        <path
          d="M 50 80 L 62 64 L 70 74 L 80 58 L 92 80 Z"
          fill="#F8EFD0"
          stroke="#1C0F05"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <text
          x="70"
          y="56"
          textAnchor="middle"
          fontFamily="var(--font-headline)"
          fontSize="14"
          fontWeight="900"
          fill="#1C0F05"
          letterSpacing="0.5"
        >
          {name}
        </text>
      </svg>
    </div>
  )
}
