import { Stepper } from "@merninos/ui";
import { LIFECYCLE_STEPS, type LifecycleStage } from "./bucket-by-lifecycle";

export interface LifecycleTrackProps {
  stage: LifecycleStage;
  dense?: boolean;
  className?: string;
}

/**
 * Crowdroast-specific stepper that pre-binds the 6 commitment lifecycle
 * stages to the generic <Stepper> in @merninos/ui. Renders a fallback chip
 * for the off-track `minimum_not_met` stage.
 */
export function LifecycleTrack({ stage, dense = false, className }: LifecycleTrackProps) {
  if (stage === "minimum_not_met") {
    return (
      <div
        className={
          "inline-flex items-center gap-2 rounded-full border-[2.5px] border-espresso bg-espresso px-3.5 py-1.5 font-body text-[11px] font-extrabold uppercase tracking-[0.1em] text-cream shadow-[3px_3px_0_var(--mernin-tomato,#E8442A)]"
        }
      >
        ✕ Min not met · refunded
      </div>
    );
  }

  return (
    <Stepper
      steps={LIFECYCLE_STEPS}
      currentKey={stage}
      dense={dense}
      className={className}
    />
  );
}
