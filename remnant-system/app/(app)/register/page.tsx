import PageHeader from "@/components/PageHeader";
import { suggestEngravedId } from "@/lib/store";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <div className="max-w-6xl">
      <PageHeader title="잔재 등록" description="촬영 → 외곽선 → 치수·정보 입력. 등록하면 대시보드 KPI와 재고에 바로 반영됩니다." />
      <RegisterForm suggestedId={suggestEngravedId()} />
    </div>
  );
}
