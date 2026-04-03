import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-2 border-espresso px-3 py-0.5 text-[0.65rem] font-body font-bold uppercase tracking-[0.1em] transition-colors focus:outline-none focus:ring-2 focus:ring-tomato focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-tomato text-cream",
        secondary: "bg-cream text-espresso",
        destructive: "bg-espresso text-cream",
        outline: "bg-transparent text-espresso",
        hot: "bg-sun text-espresso",
        fresh: "bg-matcha text-cream",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
