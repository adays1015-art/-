import type { Metadata } from "next";
import WholesaleChrome from "@/components/store/WholesaleChrome";

export const metadata: Metadata = {
  title: "B.fter Wholesale · Partner Portal",
  description: "B.fter wholesale partner portal — member pricing and bulk ordering.",
  robots: { index: false, follow: false },
};

export default function WholesaleLayout({ children }: { children: React.ReactNode }) {
  return <WholesaleChrome>{children}</WholesaleChrome>;
}
