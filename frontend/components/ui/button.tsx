"use client";

import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "icon";
  size?: "default" | "sm" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", type = "button", ...props }, ref) => {
    const base =
      "btn-motion focus-ring inline-flex items-center justify-center gap-2 font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50";

    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      default:
        "bg-[#1C1D21] text-white shadow-[0_10px_24px_rgba(28,29,33,0.18)] hover:bg-[#2a2c32]",
      secondary:
        "bg-white/60 text-[#1F2125] border border-white/70 backdrop-blur-md shadow-[0_6px_20px_rgba(31,33,37,0.05)] hover:bg-white/85",
      ghost:
        "bg-transparent text-[#4B5058] hover:bg-white/50 hover:text-[#1F2125]",
      icon:
        "bg-white/80 text-[#1F2125] border border-white/80 shadow-[0_4px_12px_rgba(31,33,37,0.06)] hover:bg-white",
    };

    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      default: "h-11 rounded-xl px-5 text-sm",
      sm: "h-9 rounded-lg px-3.5 text-xs",
      icon: "h-9 w-9 rounded-xl p-0",
    };

    return (
      <button
        ref={ref}
        type={type}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
