import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[12px] border-3 border-espresso bg-chalk px-4 py-2 text-base font-body text-espresso shadow-flat-sm ring-offset-background transition-all duration-100 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-espresso placeholder:text-espresso/40 focus-visible:outline-none focus-visible:-translate-x-[1px] focus-visible:-translate-y-[1px] focus-visible:shadow-[4px_4px_0px_theme(colors.tomato)] focus-visible:border-tomato disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
