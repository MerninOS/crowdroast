"use client";

import { Button } from "@/components/ui/button";
import { useUnitPreference } from "@/components/unit-provider";

export function UnitToggle() {
  const { unit, setUnit } = useUnitPreference();

  return (
    <div className="inline-flex items-center rounded-md border bg-muted/20 p-0.5">
      <Button
        type="button"
        size="sm"
        variant={unit === "kg" ? "default" : "ghost"}
        className="h-7 rounded-sm px-2 text-xs"
        onClick={() => setUnit("kg")}
      >
        kg
      </Button>
      <Button
        type="button"
        size="sm"
        variant={unit === "lb" ? "default" : "ghost"}
        className="h-7 rounded-sm px-2 text-xs"
        onClick={() => setUnit("lb")}
      >
        lb
      </Button>
    </div>
  );
}
