import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일 상단 바 */}
        <div className="md:hidden border-b border-border bg-bg-panel px-4 py-3 font-semibold text-ink-900">
          결제관리 시스템
        </div>
        <main className="flex-1 p-6 lg:p-8 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
