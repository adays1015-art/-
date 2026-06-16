"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Boxes, Tag, ListTree, Factory, Layers, Combine,
  Wrench, Package, Truck, Calculator, History, Database, Settings,
  ArrowLeftRight, Copy, FlaskConical, Droplet, Beaker, FileText,
  Lock, Unlock, KeyRound, X, Images,
} from "lucide-react";
import type { Role } from "@/lib/roles";
import { canAccess } from "@/lib/roles";
import {
  ADMIN_PIN, isAdminProtected, isAdminUnlocked, lockAdmin, unlockAdmin,
} from "@/lib/adminLock";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  section?: string;
  adminOnly?: boolean;       // hide for non-관리자 role (legacy gate, kept)
  // protected=true means the item belongs to a PIN-gated section.
  // When the PIN is locked, the item AND its section header are hidden.
  protected?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },

  { section: "재고", href: "/materials", label: "원료 재고", icon: Boxes },
  { href: "/material-transactions", label: "원료 입출고", icon: ArrowLeftRight },

  { section: "품목", href: "/items", label: "품목 마스터", icon: Tag },
  { href: "/bom", label: "품목 BOM", icon: ListTree },
  { href: "/bom-templates", label: "BOM 템플릿", icon: Copy },
  { href: "/item-production", label: "품목 생산", icon: Factory },

  // ─── 업사이클링 (버려지는 화장품 재활용 라인 — 별도 관리) ──────
  { section: "업사이클링", href: "/upcycle-materials", label: "업사이클 원료재고", icon: Boxes },
  { href: "/upcycle-items", label: "업사이클 품목마스터", icon: Tag },
  { href: "/upcycle-bom", label: "업사이클 BOM", icon: ListTree },
  { href: "/upcycle-production", label: "업사이클 생산", icon: Factory },
  { href: "/upcycle-yield", label: "제공처 수율", icon: Calculator },
  { href: "/test-results", label: "테스트 결과", icon: Images },

  { section: "향", href: "/fragrances", label: "향 마스터", icon: Droplet },
  { href: "/fragrance-bom", label: "향 BOM", icon: Beaker },
  { href: "/fragrance-production", label: "향 생산", icon: FlaskConical },

  { section: "세트", href: "/set-options", label: "세트 옵션", icon: Layers },
  { href: "/set-composition", label: "세트 구성", icon: Combine },
  { href: "/set-assembly", label: "세트 조립", icon: Wrench },
  { href: "/finished-sets", label: "완제품 세트 재고", icon: Package },
  { href: "/shipments", label: "출고 관리", icon: Truck },

  // ─── 관리 (PIN-gated; hidden until unlocked) ─────────────
  { section: "관리", href: "/daily-report", label: "일일 작업 보고서", icon: FileText, protected: true },
  { href: "/history", label: "작업 이력", icon: History, protected: true },
  { href: "/cost", label: "원가 계산", icon: Calculator, protected: true },
  { href: "/equipment", label: "설비관리", icon: Wrench, protected: true },
  { href: "/clients", label: "거래처관리", icon: Tag, protected: true },

  // ─── 설정 (PIN-gated; hidden until unlocked) ─────────────
  { section: "설정", href: "/schema", label: "데이터 구조", icon: Database, protected: true },
  { href: "/settings/sync", label: "CSV 동기화", icon: ArrowLeftRight, adminOnly: true, protected: true },
  { href: "/settings/sheets", label: "Google Sheets 연결", icon: Settings, adminOnly: true, protected: true },
];

export default function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // Read the admin-lock state on mount and whenever the path changes (so the
  // sections appear/disappear immediately after unlock/lock).
  useEffect(() => {
    setUnlocked(isAdminUnlocked());
    const onStorage = () => setUnlocked(isAdminUnlocked());
    window.addEventListener("storage", onStorage);
    const t = setInterval(() => setUnlocked(isAdminUnlocked()), 1500);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(t); };
  }, [pathname]);

  const visible = NAV.filter((item) => {
    if (item.adminOnly && role !== "관리자") return false;
    if (!canAccess(role, item.href)) return false;
    // PIN gate: hide protected items (and therefore their section headers)
    // entirely until the admin session is unlocked.
    if (item.protected && !unlocked) return false;
    return true;
  });

  function trySubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (unlockAdmin(pin)) {
      setUnlocked(true);
      setPinOpen(false);
      setPin("");
      setPinError(null);
    } else {
      setPinError("PIN이 올바르지 않습니다.");
    }
  }

  function doLock() {
    lockAdmin();
    setUnlocked(false);
  }

  return (
    <>
      <aside className="w-60 shrink-0 border-r border-border bg-bg-panel min-h-screen sticky top-0 hidden md:flex flex-col no-print">
        <div className="px-5 pt-6 pb-5 border-b border-border">
          <div className="text-[11px] font-medium tracking-[0.22em] text-ink-500 uppercase">
            Another Day · B.fter
          </div>
          <div className="mt-1 text-base font-semibold text-ink-900">내부 생산관리</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visible.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname?.startsWith(item.href + "/");
            const locked = isAdminProtected(item.href) && !unlocked;
            return (
              <div key={item.href}>
                {item.section && (
                  <div className="mt-3 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                    {item.section}
                  </div>
                )}
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
                    active
                      ? "bg-beige-100 text-ink-900 font-medium"
                      : "text-ink-700 hover:bg-bg-subtle"
                  }`}
                >
                  <Icon size={16} className={active ? "text-beige-600" : "text-ink-500"} />
                  <span className="flex-1">{item.label}</span>
                  {locked && <Lock size={11} className="text-ink-400 shrink-0" />}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* ─── Admin toggle (only visible affordance into 관리/설정) ─── */}
        <div className="px-3 py-3 border-t border-border">
          {unlocked ? (
            <button
              onClick={doLock}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded-md border border-border bg-bg-panel hover:bg-bg-subtle text-ink-700"
              title="세션 잠금 — 관리/설정 메뉴를 숨깁니다."
            ><Unlock size={11} /> 관리자 잠금</button>
          ) : (
            <button
              onClick={() => { setPinOpen(true); setPin(""); setPinError(null); }}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded-md border border-border bg-bg-panel hover:bg-bg-subtle text-ink-600"
              title="관리/설정 메뉴 잠금 해제"
            ><Lock size={11} /> 관리자</button>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border text-[11px] text-ink-500 leading-relaxed">
          <div>v0.5 · internal</div>
          <div>© B.fter Ops</div>
        </div>
      </aside>

      {/* ─── PIN modal (sidebar-triggered) ─────────────────── */}
      {pinOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/30 no-print"
          onClick={() => setPinOpen(false)}>
          <form onSubmit={trySubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-bg-panel rounded-xl2 shadow-card border border-border p-5">
            <div className="flex items-center gap-2 text-ink-900">
              <Lock size={16} className="text-beige-600" />
              <div className="text-base font-semibold">관리자 인증</div>
              <button type="button" className="ml-auto text-ink-500 hover:text-ink-900"
                onClick={() => setPinOpen(false)}><X size={14} /></button>
            </div>
            <div className="text-xs text-ink-500 mt-1">
              관리/설정 메뉴를 잠금 해제합니다. 세션 동안 유지되며 브라우저 종료 시 자동 잠금됩니다.
            </div>
            <label className="label mt-4">PIN</label>
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pl-8 tracking-widest"
                type="password" inputMode="numeric" autoFocus
                value={pin}
                onChange={(e) => { setPin(e.target.value); setPinError(null); }}
                placeholder="••••"
              />
            </div>
            {pinError && (
              <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                {pinError}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost"
                onClick={() => setPinOpen(false)}>취소</button>
              <button type="submit" className="btn-primary">잠금 해제</button>
            </div>
            {ADMIN_PIN === "0518" && (
              <div className="mt-3 text-[10px] text-ink-400">
                기본 PIN 사용 중 — 운영 환경에서는 <span className="font-mono">NEXT_PUBLIC_ADMIN_PIN</span>을 설정하세요.
              </div>
            )}
          </form>
        </div>
      )}
    </>
  );
}
