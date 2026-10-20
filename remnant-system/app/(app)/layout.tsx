import Sidebar, { MobileNav } from "@/components/Sidebar";
import { isSampleMode } from "@/lib/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav />
        {isSampleMode && (
          <div className="border-b border-brand-200 bg-brand-50 px-4 sm:px-6 lg:px-8 py-2 text-xs text-brand-800">
            샘플 데이터 모드 — 16주 시뮬레이션(앞 4주 V1.0 기준선, 이후 V2.0 도입). 새로 등록한 잔재는 서버 메모리에만 저장되어 서버가 다시 시작되면 사라집니다. DB 연결 후 영구 저장됩니다.
          </div>
        )}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
