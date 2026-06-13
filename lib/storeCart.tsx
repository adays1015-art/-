"use client";

// Client-side cart shared by the retail store and the wholesale member area.
// The two screens stay fully separated by using distinct storage keys and
// currencies — a retail cart never bleeds into the wholesale cart or vice
// versa. Persisted to localStorage so the cart survives reloads.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getProduct, type StoreProduct } from "@/data/storeCatalog";

export type CartMode = "retail" | "wholesale";

export interface CartLine {
  slug: string;
  colorItemNo?: string; // selected color for refills
  qty: number;
}

export interface ResolvedLine extends CartLine {
  product: StoreProduct;
  colorName?: string;
  unitPrice: number; // USD (retail) or KRW (wholesale)
  lineTotal: number;
}

interface CartContextValue {
  mode: CartMode;
  lines: CartLine[];
  resolved: ResolvedLine[];
  count: number;
  subtotal: number;
  add: (line: CartLine) => void;
  setQty: (slug: string, colorItemNo: string | undefined, qty: number) => void;
  remove: (slug: string, colorItemNo: string | undefined) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(mode: CartMode) {
  return `bfter_cart_${mode}`;
}

function sameLine(a: CartLine, slug: string, colorItemNo: string | undefined) {
  return a.slug === slug && (a.colorItemNo ?? "") === (colorItemNo ?? "");
}

export function CartProvider({
  mode,
  children,
}: {
  mode: CartMode;
  children: React.ReactNode;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(mode));
      if (raw) setLines(JSON.parse(raw));
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, [mode]);

  // Persist on change (after hydration so we don't clobber stored state).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey(mode), JSON.stringify(lines));
    } catch {
      /* storage full / unavailable */
    }
  }, [lines, mode, hydrated]);

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => sameLine(l, line.slug, line.colorItemNo));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + line.qty };
        return next;
      }
      return [...prev, line];
    });
  }, []);

  const setQty = useCallback(
    (slug: string, colorItemNo: string | undefined, qty: number) => {
      setLines((prev) =>
        prev
          .map((l) => (sameLine(l, slug, colorItemNo) ? { ...l, qty } : l))
          .filter((l) => l.qty > 0),
      );
    },
    [],
  );

  const remove = useCallback((slug: string, colorItemNo: string | undefined) => {
    setLines((prev) => prev.filter((l) => !sameLine(l, slug, colorItemNo)));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const resolved = useMemo<ResolvedLine[]>(() => {
    return lines.flatMap((l) => {
      const product = getProduct(l.slug);
      if (!product) return [];
      const unitPrice = mode === "retail" ? product.retailUsd : product.wholesaleKrw;
      const colorName = l.colorItemNo
        ? product.colors.find((c) => c.itemNo === l.colorItemNo)?.name
        : undefined;
      return [
        {
          ...l,
          product,
          colorName,
          unitPrice,
          lineTotal: unitPrice * l.qty,
        },
      ];
    });
  }, [lines, mode]);

  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);
  const subtotal = useMemo(
    () => resolved.reduce((s, l) => s + l.lineTotal, 0),
    [resolved],
  );

  const value: CartContextValue = {
    mode,
    lines,
    resolved,
    count,
    subtotal,
    add,
    setQty,
    remove,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
