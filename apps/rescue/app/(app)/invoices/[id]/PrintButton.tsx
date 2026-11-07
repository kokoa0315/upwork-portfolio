"use client";

import { Printer } from "lucide-react";
import { buttonStyles } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonStyles.secondary} mt-4 w-full`}>
      <Printer className="size-4" aria-hidden /> Print or save as PDF
    </button>
  );
}
