import type { ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
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

export function TR({
  children,
  onClick,
  highlight,
}: {
  children: ReactNode;
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={`${onClick ? "cursor-pointer hover:bg-bg-subtle" : ""} ${
        highlight ? "bg-amber-50/40" : ""
      }`}
    >
      {children}
    </tr>
  );
}

export function TH({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`table-th ${className}`}>{children}</th>;
}

export function TD({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`table-td ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <tr>
      <td colSpan={99} className="px-3 py-10 text-center text-sm text-ink-500">
        {children}
      </td>
    </tr>
  );
}
