import type { MaterialCategory } from "@/types";

// 카테고리별 뱃지 색상 — 한눈에 구분되도록 카테고리마다 다른 색을 부여.
// Tailwind 표준 팔레트(100/700/200) 사용. 정의되지 않은 값은 회색 폴백.
const MAP: Record<string, string> = {
  기본원료: "bg-slate-100 text-slate-700 border-slate-200",
  왁스: "bg-amber-100 text-amber-800 border-amber-200",
  오일: "bg-yellow-100 text-yellow-800 border-yellow-200",
  안료: "bg-rose-100 text-rose-700 border-rose-200",
  향료: "bg-violet-100 text-violet-700 border-violet-200",
  케미컬: "bg-cyan-100 text-cyan-800 border-cyan-200",
  패키지: "bg-blue-100 text-blue-700 border-blue-200",
  기타: "bg-stone-100 text-stone-600 border-stone-200",
  바인더: "bg-lime-100 text-lime-800 border-lime-200",
  용기: "bg-indigo-100 text-indigo-700 border-indigo-200",
  스티커: "bg-pink-100 text-pink-700 border-pink-200",
  // 업사이클 라인 (폐화장품)
  립스틱: "bg-red-100 text-red-700 border-red-200",
  아이섀도우: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  립글로스: "bg-orange-100 text-orange-700 border-orange-200",
  샴푸: "bg-sky-100 text-sky-700 border-sky-200",
  기타화장품: "bg-teal-100 text-teal-700 border-teal-200",
};

const FALLBACK = "bg-beige-100 text-ink-800 border-beige-200";

export function categoryBadgeClass(category: MaterialCategory | string | undefined): string {
  if (!category) return FALLBACK;
  return MAP[category] ?? FALLBACK;
}
