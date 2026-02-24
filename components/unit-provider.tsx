"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_WEIGHT_UNIT, type WeightUnit } from "@/lib/units";

const STORAGE_KEY = "crowdroast:weight-unit";

type UnitContextValue = {
  unit: WeightUnit;
  setUnit: (unit: WeightUnit) => void;
};

const UnitContext = createContext<UnitContextValue | null>(null);

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "kg" || stored === "lb") {
      setUnitState(stored);
    }
  }, []);

  const setUnit = (nextUnit: WeightUnit) => {
    setUnitState(nextUnit);
    window.localStorage.setItem(STORAGE_KEY, nextUnit);
  };

  const value = useMemo(() => ({ unit, setUnit }), [unit]);

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnitPreference() {
  const ctx = useContext(UnitContext);
  if (!ctx) {
    throw new Error("useUnitPreference must be used within UnitProvider");
  }
  return ctx;
}
