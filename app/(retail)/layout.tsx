import type { Metadata } from "next";
import RetailChrome from "@/components/store/RetailChrome";

export const metadata: Metadata = {
  title: "B.fter · Scented Art Materials",
  description:
    "B.fter (Another Day) — scented oil pastels, watercolors and solid watercolors. Global store, shipping worldwide.",
};

export default function RetailLayout({ children }: { children: React.ReactNode }) {
  return <RetailChrome>{children}</RetailChrome>;
}
