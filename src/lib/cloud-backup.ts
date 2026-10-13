// Optional online backup, keyed by a hash of mobile number + NID.
// The ledger itself stays on-device; this only stores a copy for recovery.
import { supabase } from "@/integrations/supabase/client";
import { exportBackup, parseBackup, restoreBackup, subscribeDB } from "./ledger";

const KEY = "shk-cloud-recovery";
const SALT = "shohoj-hisab-khata-v1";

export function normPhone(p: string) {
  const d = p.replace(/\D/g, "");
  return d.startsWith("880") ? "0" + d.slice(3) : d;
}
export function validInputs(phone: string, nid: string) {
  return /^01\d{9}$/.test(normPhone(phone)) && /^\d{10,17}$/.test(nid.replace(/\D/g, ""));
}

async function makeKey(phone: string, nid: string) {
  const s = `${SALT}|${normPhone(phone)}|${nid.replace(/\D/g, "")}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Saved = { key: string; phone: string; lastSync?: number };
export function getRecovery(): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function setRecovery(s: Saved | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
}

export async function uploadNow(): Promise<number> {
  const r = getRecovery();
  if (!r) throw new Error("আগে মোবাইল নম্বর ও NID দিন");
  const { error } = await supabase.rpc("save_cloud_backup", { p_key: r.key, p_data: JSON.parse(exportBackup()) });
  if (error) throw new Error("ইন্টারনেট সংযোগ দেখুন, পরে আবার চেষ্টা করুন");
  const t = Date.now();
  setRecovery({ ...r, lastSync: t });
  return t;
}

export async function setupRecovery(phone: string, nid: string) {
  setRecovery({ key: await makeKey(phone, nid), phone: normPhone(phone) });
  return uploadNow();
}

export function stopRecovery() { setRecovery(null); }

export async function recoverFrom(phone: string, nid: string) {
  const key = await makeKey(phone, nid);
  const { data, error } = await supabase.rpc("get_cloud_backup", { p_key: key });
  if (error) throw new Error("ইন্টারনেট সংযোগ দেখুন, পরে আবার চেষ্টা করুন");
  const row = data as { data: unknown } | null;
  if (!row?.data) throw new Error("এই নম্বর ও NID দিয়ে কোনো হিসাব পাওয়া যায়নি");
  const db = parseBackup(JSON.stringify(row.data));
  restoreBackup(db, "merge");
  setRecovery({ key, phone: normPhone(phone), lastSync: Date.now() });
  return db;
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Auto-upload a few seconds after any change, and when the phone comes online. */
export function startAutoSync() {
  const schedule = () => {
    if (!getRecovery()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (navigator.onLine) void uploadNow().catch(() => {}); }, 5000);
  };
  const off = subscribeDB(schedule);
  window.addEventListener("online", schedule);
  schedule();
  return () => { off(); window.removeEventListener("online", schedule); clearTimeout(timer); };
}
