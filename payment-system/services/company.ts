import type { CompanyInfo } from "@/types";
import { getStore } from "./store";

export async function getCompany(): Promise<CompanyInfo> {
  return getStore().company;
}

export async function updateCompany(patch: Partial<CompanyInfo>): Promise<CompanyInfo> {
  const s = getStore();
  s.company = { ...s.company, ...patch };
  return s.company;
}
