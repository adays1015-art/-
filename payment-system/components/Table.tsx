import type { ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}
export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}
export function TR({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-border last:border-0 ${onClick ? "cursor-pointer hover:bg-bg-subtle/60" : ""}`}
    >
      {children}
    </tr>
  );
}
export function TH({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500 bg-bg-subtle border-b border-border ${className}`}>
      {children}
    </th>
  );
}
export function TD({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 text-sm text-ink-800 ${className}`}>{children}</td>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-ink-500">{children}</div>;
}
