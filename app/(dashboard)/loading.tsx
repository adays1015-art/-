/**
 * Shown by Next.js while a (dashboard) server component is rendering on
 * navigation. The chrome (Sidebar, TopBar) stays from the layout — this only
 * occupies the <main> region. Hidden in print because the global @media
 * print rule strips .no-print elements.
 */
export default function DashboardLoading() {
  return (
    <div className="no-print animate-pulse" aria-label="loading">
      {/* Title row */}
      <div className="mb-6">
        <div className="h-3 w-24 bg-bg-subtle rounded mb-2" />
        <div className="h-6 w-64 bg-bg-subtle rounded" />
      </div>

      {/* Action bar */}
      <div className="mb-4 panel panel-pad">
        <div className="flex items-center gap-3">
          <div className="h-9 flex-1 bg-bg-subtle rounded" />
          <div className="h-9 w-32 bg-bg-subtle rounded" />
          <div className="h-9 w-24 bg-bg-subtle rounded" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="panel overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-bg-subtle/50">
          <div className="h-3 w-32 bg-bg-subtle rounded" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-border last:border-b-0">
            <div className="h-3 w-16 bg-bg-subtle rounded" />
            <div className="h-3 w-40 bg-bg-subtle rounded" />
            <div className="h-3 w-20 bg-bg-subtle rounded" />
            <div className="h-3 w-24 bg-bg-subtle rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
