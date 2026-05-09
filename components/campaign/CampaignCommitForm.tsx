'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button as ShadButton } from '@/components/ui/button'
import { useUnitPreference } from '@/components/unit-provider'
import {
  fromDisplayWeight,
  toDisplayWeight,
  toDisplayPricePerUnit,
  type WeightUnit,
} from '@/lib/units'
import { addPlatformFee } from '@/lib/pricing'

interface CampaignCommitFormProps {
  lotId: string
  /** Per-kg price at the active tier. */
  activePricePerKg: number
  /** Remaining kg available on the lot. */
  maxKg: number
  hubId?: string
  /** Display name for the active tier ('Listed', 'Trigger', 'Full Tier', etc.). */
  activeTierName: string
  /** Number of roasters currently in — surfaces on the header. */
  biddersIn: number
  onSuccess?: () => void
}

// Unit-aware preset chips. The prototype hard-codes 44/88/132/220 lb;
// we provide an analogous kg ladder so the chips read clean in either
// unit (no mid-range decimals).
function getPresets(unit: WeightUnit): number[] {
  return unit === 'lb' ? [44, 88, 132, 220] : [20, 40, 60, 100]
}
function getStep(unit: WeightUnit): number {
  return unit === 'lb' ? 22 : 10
}

// Direct port of design/project/campaign/CommitForm.jsx — espresso card
// with sun-colored eyebrow, +/- quantity, preset chips, dashed-border
// totals row, and big display-font total. Wires the actual submission
// to POST /api/commitments via the same flow CommitmentForm uses (the
// confirm dialog + Stripe checkout redirect path are preserved so the
// payment surface stays intact).
export function CampaignCommitForm({
  lotId,
  activePricePerKg,
  maxKg,
  hubId,
  activeTierName,
  biddersIn,
  onSuccess,
}: CampaignCommitFormProps) {
  const router = useRouter()
  const { unit } = useUnitPreference()

  const maxDisplay = Math.floor(toDisplayWeight(maxKg, unit))
  const presets = getPresets(unit)
  const step = getStep(unit)
  const defaultDisplay = presets.find((n) => n <= maxDisplay) ?? 1

  const [qty, setQty] = React.useState<number>(defaultDisplay)
  const [notes, setNotes] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [committed, setCommitted] = React.useState(false)

  // When the unit toggle flips mid-session, convert qty so the buyer
  // doesn't see "88 lb" suddenly become "88 kg".
  const prevUnitRef = React.useRef(unit)
  React.useEffect(() => {
    if (prevUnitRef.current !== unit) {
      const asKg = fromDisplayWeight(qty, prevUnitRef.current)
      setQty(Math.round(toDisplayWeight(asKg, unit)))
      prevUnitRef.current = unit
    }
  }, [unit, qty])

  const qtyKg = fromDisplayWeight(qty, unit)
  const buyerPricePerKg = addPlatformFee(activePricePerKg)
  const total = qtyKg * buyerPricePerKg
  const displayPricePerUnit = toDisplayPricePerUnit(buyerPricePerKg, unit)

  const validate = (): boolean => {
    if (qty <= 0) {
      toast.error(`Quantity must be greater than 0`)
      return false
    }
    if (qty > maxDisplay) {
      toast.error(`Only ${maxDisplay.toLocaleString()} ${unit} left on this lot`)
      return false
    }
    return true
  }

  const handleCommit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setConfirmOpen(true)
  }

  const submit = async () => {
    if (!validate()) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/commitments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lot_id: lotId,
          quantity_kg: qtyKg,
          notes,
          hub_id: hubId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error || 'Failed to create commitment')
      }
      const payload = await res.json()
      if (payload?.checkout_url) {
        window.location.href = payload.checkout_url as string
        return
      }
      toast.success('Commitment created.')
      setConfirmOpen(false)
      setCommitted(true)
      onSuccess?.()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went sideways')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleCommit}
      style={{
        background: 'var(--color-espresso)',
        color: 'var(--color-cream)',
        border: '4px solid var(--color-espresso)',
        borderRadius: 20,
        padding: 22,
        boxShadow: '6px 6px 0 var(--color-tomato)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--color-sun)',
          }}
        >
          Join the buy
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            opacity: 0.6,
          }}
        >
          {biddersIn} roasters in
        </div>
      </div>

      {/* Quantity row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setQty(Math.max(1, qty - step))}
          aria-label="Decrease quantity"
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            border: '3px solid var(--color-cream)',
            background: 'transparent',
            color: 'var(--color-cream)',
            fontSize: 20,
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={qty}
          min={1}
          max={maxDisplay}
          step={1}
          aria-label={`Quantity in ${unit === 'kg' ? 'kilograms' : 'pounds'}`}
          onChange={(e) => {
            const next = Number.parseInt(e.target.value, 10)
            setQty(Number.isFinite(next) ? next : 0)
          }}
          style={{
            flex: 1,
            height: 50,
            border: '3px solid var(--color-cream)',
            borderRadius: 12,
            background: 'var(--color-roast)',
            color: 'var(--color-cream)',
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            textAlign: 'center',
            outline: 'none',
            minWidth: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            opacity: 0.7,
            width: 20,
          }}
        >
          {unit}
        </span>
        <button
          type="button"
          onClick={() => setQty(Math.min(maxDisplay, qty + step))}
          aria-label="Increase quantity"
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            border: '3px solid var(--color-cream)',
            background: 'transparent',
            color: 'var(--color-cream)',
            fontSize: 20,
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          +
        </button>
      </div>

      {/* Preset chips */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setQty(n)}
            style={{
              flex: '1 1 0',
              padding: '8px 4px',
              background: qty === n ? 'var(--color-tomato)' : 'transparent',
              border: '2px solid var(--color-cream)',
              borderRadius: 8,
              color: 'var(--color-cream)',
              fontFamily: 'var(--font-body)',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {n} {unit}
          </button>
        ))}
      </div>

      {/* Stats row with dashed borders */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          padding: '12px 0',
          borderTop: '2px dashed var(--color-roast)',
          borderBottom: '2px dashed var(--color-roast)',
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              opacity: 0.6,
              whiteSpace: 'nowrap',
            }}
          >
            Locked at {activeTierName}
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.85,
              marginTop: 2,
              whiteSpace: 'nowrap',
            }}
          >
            ${displayPricePerUnit.toFixed(2)}/{unit}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              opacity: 0.6,
            }}
          >
            Your total
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 34,
              lineHeight: 1,
            }}
          >
            ${total.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Commit button OR success state */}
      {committed ? (
        <div
          style={{
            background: 'var(--color-matcha)',
            color: 'var(--color-cream)',
            border: '3px solid var(--color-cream)',
            borderRadius: 12,
            padding: 14,
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          ✓ You&apos;re in. {qty} {unit} committed.
        </div>
      ) : (
        <button
          type="submit"
          disabled={isLoading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            height: 46,
            padding: '0 28px',
            borderRadius: 9999,
            border: '2.5px solid var(--color-espresso)',
            background: isLoading ? 'var(--color-roast)' : 'var(--accent-1)',
            color: 'var(--accent-1-fg)',
            fontFamily: 'var(--font-body)',
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            boxShadow: '4px 4px 0 var(--color-cream)',
          }}
        >
          {isLoading ? 'Submitting…' : `Commit · ${qty} ${unit} →`}
        </button>
      )}

      <div
        style={{
          fontSize: 11,
          opacity: 0.6,
          marginTop: 12,
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        Refund in full if the campaign doesn&apos;t hit its minimum. No fees.
      </div>

      {/* Confirm dialog (preserves CommitmentForm's safety net) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Commitment</DialogTitle>
            <DialogDescription>
              Your card is charged immediately when you commit. Funds are held
              until the lot deadline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Quantity: <span className="font-medium">{qty} {unit}</span>
            </p>
            <p>
              Price at commitment:{' '}
              <span className="font-medium">
                ${displayPricePerUnit.toFixed(2)}/{unit}
              </span>
            </p>
            <p>
              Charged now:{' '}
              <span className="font-medium">${total.toFixed(2)}</span>
            </p>
          </div>
          <DialogFooter>
            <ShadButton
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </ShadButton>
            <ShadButton type="button" onClick={submit} disabled={isLoading}>
              {isLoading ? 'Processing…' : 'Confirm and Charge'}
            </ShadButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
