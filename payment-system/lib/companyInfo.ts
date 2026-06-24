// 공급자(자사) 정보 — 문서 머리말/하단에 인쇄된다.
//
// 운영 환경에서는 NEXT_PUBLIC_COMPANY_* 환경변수로 덮어쓸 수 있다.
// (예: NEXT_PUBLIC_COMPANY_NAME, NEXT_PUBLIC_COMPANY_BIZNO …)
// 환경변수가 없으면 아래 기본값을 사용한다. 값은 거래문서 출력에만 쓰이며
// 어디에도 저장되지 않는다 — 자유롭게 수정하세요.

export interface CompanyInfo {
  name: string;        // 상호 / 회사명
  nameEn?: string;     // 영문 상호 (인보이스용)
  ceo: string;         // 대표자
  bizNo: string;       // 사업자등록번호
  address: string;     // 주소
  addressEn?: string;  // 영문 주소 (인보이스용)
  phone: string;
  fax?: string;
  email?: string;
  // 입금/송금 정보 (거래명세서·인보이스 하단)
  bank?: string;
  account?: string;
  accountHolder?: string;
  swift?: string;      // 해외송금용 SWIFT 코드 (인보이스)
}

const env = (k: string, fallback: string) =>
  (process.env[`NEXT_PUBLIC_COMPANY_${k}`] ?? "").trim() || fallback;

export const COMPANY: CompanyInfo = {
  name: env("NAME", "비프터 (B.fter)"),
  nameEn: env("NAME_EN", "B.fter Co., Ltd."),
  ceo: env("CEO", "대표자명"),
  bizNo: env("BIZNO", "000-00-00000"),
  address: env("ADDRESS", "서울특별시 ○○구 ○○로 00"),
  addressEn: env("ADDRESS_EN", "Seoul, Republic of Korea"),
  phone: env("PHONE", "02-0000-0000"),
  fax: env("FAX", ""),
  email: env("EMAIL", "contact@bfter.co"),
  bank: env("BANK", "○○은행"),
  account: env("ACCOUNT", "000-000000-00-000"),
  accountHolder: env("ACCOUNT_HOLDER", "비프터"),
  swift: env("SWIFT", ""),
};
