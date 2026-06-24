// 공급자(자사) 기본 정보 — 앱 최초 구동 시의 시드 값.
// 실제 값은 "회사정보" 화면에서 수정하면 저장소에 보관되어 인쇄에 반영된다.
// 환경변수 NEXT_PUBLIC_COMPANY_* 가 있으면 그 값을 기본값으로 사용한다.
import type { CompanyInfo } from "@/types";

const env = (k: string, fallback: string) =>
  (process.env[`NEXT_PUBLIC_COMPANY_${k}`] ?? "").trim() || fallback;

export const DEFAULT_COMPANY: CompanyInfo = {
  name: env("NAME", "(주)어나더데이"),
  nameEn: env("NAME_EN", "Another Day Inc."),
  ceo: env("CEO", ""),
  bizNo: env("BIZNO", ""),
  address: env("ADDRESS", ""),
  addressEn: env("ADDRESS_EN", ""),
  phone: env("PHONE", ""),
  fax: env("FAX", ""),
  email: env("EMAIL", ""),
  bank: env("BANK", ""),
  account: env("ACCOUNT", ""),
  accountHolder: env("ACCOUNT_HOLDER", ""),
  swift: env("SWIFT", ""),
  stampDataUrl: "",
};
