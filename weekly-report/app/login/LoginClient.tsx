"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck, User } from "lucide-react";
import type { Role } from "@/lib/types";

export default function LoginClient({ members }: { members: { team: string; name: string }[] }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>("팀원");
  const [password, setPassword] = useState("");
  const [team, setTeam] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const teams = useMemo(
    () => Array.from(new Set(members.map((m) => m.team).filter(Boolean))).sort(),
    [members],
  );
  const namesForTeam = useMemo(
    () => members.filter((m) => !team || m.team === team).map((m) => m.name),
    [members, team],
  );

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, role, name, team }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "로그인 실패"); return; }
      router.push(role === "관리자" ? "/" : "/reports");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <form onSubmit={submit} className="panel panel-pad w-full max-w-sm">
        <div className="text-[11px] font-medium tracking-[0.22em] text-ink-500 uppercase">B.fter · Another Day</div>
        <h1 className="text-xl font-semibold text-ink-900 mt-1 mb-1">주간업무관리</h1>
        <p className="text-sm text-ink-600 mb-5">팀 주간 업무 보고 · 관리 시스템</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button type="button"
            onClick={() => setRole("팀원")}
            className={`btn ${role === "팀원" ? "bg-ink-900 text-bg border-ink-900" : "bg-bg-panel text-ink-700 border-border"}`}>
            <User size={14} /> 팀원
          </button>
          <button type="button"
            onClick={() => setRole("관리자")}
            className={`btn ${role === "관리자" ? "bg-ink-900 text-bg border-ink-900" : "bg-bg-panel text-ink-700 border-border"}`}>
            <ShieldCheck size={14} /> 관리자
          </button>
        </div>

        {role === "팀원" && (
          <div className="space-y-3 mb-3">
            <div>
              <label className="label">팀</label>
              <input className="input" list="teams" placeholder="예: 생산팀"
                value={team} onChange={(e) => setTeam(e.target.value)} />
              <datalist id="teams">{teams.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label className="label">이름</label>
              <input className="input" list="names" placeholder="이름 입력 / 선택"
                value={name} onChange={(e) => setName(e.target.value)} />
              <datalist id="names">{namesForTeam.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="label">공용 비밀번호</label>
          <input className="input" type="password" placeholder="비밀번호"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <div className="mb-3 text-sm text-status-danger">{error}</div>}

        <button className="btn-primary w-full justify-center" disabled={busy}>
          <LogIn size={14} /> {busy ? "확인 중…" : "들어가기"}
        </button>
      </form>
    </div>
  );
}
