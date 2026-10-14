// Subscription: 30-day free trial, then paid plans approved by the owner from the admin panel.
// The approved period is cached on the device so the ledger keeps working offline.
import { supabase } from "@/integrations/supabase/client";

export const TRIAL_DAYS = 30;
export const PAY_NUMBER = "01614498916";
export const PLANS = [
  { id: "m1", label: "১ মাস", price: 30 },
  { id: "m2", label: "২ মাস", price: 50 },
  { id: "m5", label: "৫ মাস", price: 100 },
  { id: "y1", label: "১ বছর", price: 200 },
  { id: "life", label: "লাইফটাইম", price: 1000 },
] as const;
export type PlanId = (typeof PLANS)[number]["id"];
export const planLabel = (id: string) => PLANS.find((p) => p.id === id)?.label ?? id;

const TOKEN = "shk-device-token";
const CODE = "shk-device-code";
const TRIAL = "shk-trial-start";
const CACHE = "shk-license";
const OWNER = "shk-owner";
const OLD_ACT = "shk-activated";

export type Latest = { status: "pending" | "approved" | "rejected"; reason?: string | null; plan: string; expires_at?: string | null } | null;
type Cache = { best: { plan: string; expires_at: string | null } | null; latest: Latest };

const rpc = (fn: string, args?: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

export function deviceToken() {
  let t = localStorage.getItem(TOKEN);
  if (!t) { t = crypto.randomUUID(); localStorage.setItem(TOKEN, t); }
  return t;
}
export function deviceCode() {
  let c = localStorage.getItem(CODE);
  if (!c) { c = "SHK-" + (crypto.getRandomValues(new Uint32Array(1))[0]! % 9000 + 1000); localStorage.setItem(CODE, c); }
  return c;
}
function trialStart() {
  let s = Number(localStorage.getItem(TRIAL));
  if (!s) { s = Date.now(); localStorage.setItem(TRIAL, String(s)); }
  return s;
}
export const trialLeftDays = () => Math.max(0, Math.ceil((trialStart() + TRIAL_DAYS * 864e5 - Date.now()) / 864e5));

const readCache = (): Cache => { try { return JSON.parse(localStorage.getItem(CACHE) || "") as Cache; } catch { return { best: null, latest: null }; } };
export const latestRequest = () => readCache().latest;

export const setOwnerDevice = () => localStorage.setItem(OWNER, "1");

export function canTransact(): boolean {
  if (localStorage.getItem(OWNER) === "1" || localStorage.getItem(OLD_ACT) === "1") return true;
  if (trialLeftDays() > 0) return true;
  const b = readCache().best;
  if (!b) return false;
  return b.expires_at === null || new Date(b.expires_at).getTime() > Date.now();
}

/** Pull the latest approval state from the internet (silently ignored when offline). */
export async function refreshLicense(): Promise<Cache | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  const { data, error } = await rpc("get_license", { p_token: deviceToken() });
  if (error) return null;
  const c = (data ?? { best: null, latest: null }) as Cache;
  localStorage.setItem(CACHE, JSON.stringify(c));
  return c;
}

export async function submitPayment(plan: PlanId, payer: string, trx: string) {
  const { error } = await rpc("submit_license_request", { p_token: deviceToken(), p_code: deviceCode(), p_payer: payer, p_trx: trx.trim(), p_plan: plan });
  if (error) throw new Error(error.message.includes("too many") ? "আজ অনেকবার জমা দিয়েছেন, কাল আবার চেষ্টা করুন" : "ইন্টারনেট সংযোগ দেখুন ও সঠিক তথ্য দিন");
  await refreshLicense();
}

export function whatsappLink(plan: PlanId, payer: string, trx: string) {
  const p = PLANS.find((x) => x.id === plan)!;
  const msg = `সহজ হিসাব খাতা — পেমেন্ট\nডিভাইস: ${deviceCode()}\nপ্যাকেজ: ${p.label} (${p.price} টাকা)\nযে নম্বর থেকে: ${payer}\nTrxID: ${trx.trim().toUpperCase()}`;
  return `https://wa.me/88${PAY_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// ---- Admin (master key verified on the server) ----
export type Req = { id: string; device_code: string; payer: string; trx_id: string; plan: string; status: string; reason: string | null; expires_at: string | null; created_at: string };
export async function adminList(key: string): Promise<Req[]> {
  const { data, error } = await rpc("admin_list_requests", { p_key: key });
  if (error) throw new Error("তালিকা আনা যায়নি — ইন্টারনেট দেখুন");
  return (data ?? []) as Req[];
}
export async function adminDecide(key: string, id: string, approve: boolean, reason = "") {
  const { error } = await rpc("admin_decide", { p_key: key, p_id: id, p_approve: approve, p_reason: reason });
  if (error) throw new Error("সংরক্ষণ করা যায়নি");
}

// ---- App updates ----
export const APP_VERSION = Number(import.meta.env["VITE_APP_VERSION"] || 0);
export type Release = { version_code: number; apk_url: string; notes: string; force: boolean };
export async function getRelease(): Promise<Release | null> {
  const { data, error } = await rpc("get_app_release");
  return error ? null : (data as Release);
}
export async function adminSetRelease(key: string, r: Release) {
  const { error } = await rpc("admin_set_release", { p_key: key, p_version: r.version_code, p_url: r.apk_url, p_notes: r.notes, p_force: r.force });
  if (error) throw new Error("সংরক্ষণ করা যায়নি — লিংক https:// দিয়ে শুরু হতে হবে");
}
