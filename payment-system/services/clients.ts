import type { PayClient } from "@/types";
import { getStore } from "./store";
import { genId, nowISO } from "@/lib/utils";

export async function listClients(): Promise<PayClient[]> {
  return getStore().clients.slice().sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function createClient(
  input: Partial<PayClient> & { name: string },
): Promise<PayClient> {
  const c: PayClient = {
    id: input.id || genId("CL"),
    name: input.name.trim(),
    contact: input.contact ?? "",
    phone: input.phone ?? "",
    note: input.note ?? "",
    createdAt: input.createdAt || nowISO(),
  };
  getStore().clients.push(c);
  return c;
}

export async function updateClient(
  id: string, patch: Partial<PayClient>,
): Promise<PayClient | null> {
  const list = getStore().clients;
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id, createdAt: list[idx].createdAt };
  return list[idx];
}

export async function deleteClient(id: string): Promise<boolean> {
  const s = getStore();
  const before = s.clients.length;
  s.clients = s.clients.filter((c) => c.id !== id);
  return s.clients.length < before;
}
