"use client";

import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`focus-ring w-full bg-transparent text-[#1F2125] placeholder:text-[#9AA0AA] outline-none disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  );
});
Input.displayName = "Input";
