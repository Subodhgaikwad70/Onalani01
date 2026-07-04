"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      className={cn("rdp-root rounded-xl border border-border bg-card p-3 shadow-sm", className)}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
