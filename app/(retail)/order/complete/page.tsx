import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function OrderCompletePage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const orderId = searchParams.id ?? "BF-XXXXXX";
  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-status-done" />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">
        Thank you for your order
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        Your order <span className="font-semibold text-ink-900">{orderId}</span> has been
        received. A confirmation email is on its way.
      </p>
      <div className="mt-8">
        <Link
          href="/product"
          className="inline-block rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
