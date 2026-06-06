"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export default function DeniedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md panel panel-pad text-center">
        <div className="text-[11px] font-medium tracking-[0.22em] text-ink-500 uppercase">
          접근 제한
        </div>
        <h1 className="mt-2 text-xl font-semibold text-ink-900">
          승인되지 않은 계정입니다
        </h1>
        <p className="mt-2 text-sm text-ink-600 leading-relaxed">
          이 시스템은 Another Day 운영팀에서 승인된 Google 계정만 접속할 수 있습니다.<br />
          접속 권한은 운영팀에 요청해 주세요.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn-primary">
            다른 계정으로 로그인
          </button>
          <Link href="/login" className="btn-ghost">로그인 페이지로</Link>
        </div>
      </div>
    </div>
  );
}
