'use client'

import * as React from 'react'
import Image from 'next/image'
import { Badge, Starburst } from '@merninos/ui'
import type { Lot } from '@/lib/types'

interface CampaignHeroProps {
  lot: Lot
  hubName?: string | null
}

// Image-led hero. Reads the lot.images array — first entry is the main hero,
// remaining entries are thumbnails. When the array is empty, renders a brand
// placeholder (cream + tomato Starburst + lot title in display font) instead
// of leaving a broken-image hole.
export function CampaignHero({ lot, hubName }: CampaignHeroProps) {
  const [activeIdx, setActiveIdx] = React.useState(0)
  const images = lot.images ?? []
  const hasImages = images.length > 0
  const heroSrc = hasImages ? images[activeIdx] : null
  const thumbs = hasImages ? images : []

  return (
    <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div className="flex flex-col gap-4">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[20px] border-[5px] border-espresso bg-cream shadow-[6px_6px_0_var(--mernin-espresso,#1C0F05)]">
          {heroSrc ? (
            <Image
              src={heroSrc}
              alt={lot.title}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-8 relative">
              <Starburst label="Coffee" color="sun" size={180} />
              <h1 className="font-display text-4xl sm:text-6xl text-espresso text-center leading-tight relative px-4 mix-blend-multiply">
                {lot.title}
              </h1>
            </div>
          )}
          {lot.score != null && (
            <div className="absolute right-4 top-4">
              <Starburst label={String(lot.score)} color="sun" size={72} />
            </div>
          )}
        </div>

        {thumbs.length > 1 && (
          <ul className="flex gap-3 overflow-x-auto">
            {thumbs.map((src, i) => (
              <li key={src + i}>
                <button
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  aria-label={`Show image ${i + 1} of ${thumbs.length}`}
                  className={`relative h-20 w-24 shrink-0 overflow-hidden rounded-[12px] border-[3px] transition-all duration-100 ${
                    i === activeIdx
                      ? 'border-tomato shadow-flat-sm'
                      : 'border-espresso opacity-70 hover:opacity-100'
                  }`}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:pt-4">
        <div className="flex flex-wrap gap-2">
          {hubName && <Badge>{hubName}</Badge>}
          {lot.farm && <Badge>{lot.farm}</Badge>}
          {lot.region && <Badge>{lot.region}</Badge>}
          {lot.origin_country && <Badge>{lot.origin_country}</Badge>}
        </div>
        <h1 className="font-display text-5xl sm:text-7xl text-espresso leading-[0.95]">
          {lot.title}
        </h1>
        {lot.description && (
          <p className="font-body text-base sm:text-lg text-espresso/80 max-w-prose">
            {lot.description}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-4 text-sm font-body">
          {lot.process && (
            <div>
              <dt className="uppercase tracking-[0.1em] text-xs text-espresso/60">Process</dt>
              <dd className="font-bold text-espresso">{lot.process}</dd>
            </div>
          )}
          {lot.variety && (
            <div>
              <dt className="uppercase tracking-[0.1em] text-xs text-espresso/60">Variety</dt>
              <dd className="font-bold text-espresso">{lot.variety}</dd>
            </div>
          )}
          {(lot.altitude_min != null || lot.altitude_max != null) && (
            <div>
              <dt className="uppercase tracking-[0.1em] text-xs text-espresso/60">Altitude</dt>
              <dd className="font-bold text-espresso">
                {lot.altitude_min ?? '?'}–{lot.altitude_max ?? '?'}m
              </dd>
            </div>
          )}
          {lot.crop_year && (
            <div>
              <dt className="uppercase tracking-[0.1em] text-xs text-espresso/60">Crop year</dt>
              <dd className="font-bold text-espresso">{lot.crop_year}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  )
}
