import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

export default function WholesaleOrderCompletePage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const poId = searchParams.id ?? "PO-XXXXX";
  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <ClipboardCheck className="mx-auto h-14 w-14 text-status-done" />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">
        Purchase order submitted
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        Your order <span className="font-semibold text-ink-900">{poId}</span> has been received.
        Our team will confirm availability and lead time by email.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/wholesale/catalog"
          className="inline-block rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800"
        >
          Back to catalog
        </Link>
      </div>
    </div>
  );
}
