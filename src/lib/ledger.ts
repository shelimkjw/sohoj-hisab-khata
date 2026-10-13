// Local-only ledger store. All data lives in this device's localStorage.
import { useSyncExternalStore } from "react";

export type TxType = "credit" | "received" | "owed" | "paid" | "income" | "expense";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  openingBalance: number; // positive = customer owes me, negative = I owe customer
  notes: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Tx {
  id: string;
  customerId?: string | undefined;
  type: TxType;
  amount: number;
  date: number;
  description: string;
  reference: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  action: "edit" | "delete" | "restore-backup";
  entity: "customer" | "tx";
  entityId: string;
  before?: unknown;
}

export interface Settings {
  shopName: string;
  pinHash?: string | undefined;
  pinSalt?: string | undefined;
  lastBackupAt?: number;
  dark: boolean;
}

export interface DB {
  version: 1;
  customers: Customer[];
  txs: Tx[];
  audit: AuditEntry[];
  settings: Settings;
}

const KEY = "tali-khata-db-v1";

export const TX_LABEL: Record<TxType, string> = {
  credit: "বাকি দিলাম",
  received: "টাকা পেলাম",
  owed: "গ্রাহকের পাওনা",
  paid: "টাকা দিলাম",
  income: "আয়",
  expense: "খরচ",
};

export const CUSTOMER_TYPES: TxType[] = ["credit", "received", "owed", "paid"];

/** Effect of a transaction on what the customer owes me. */
export function balanceEffect(t: TxType, amt: number) {
  if (t === "credit" || t === "paid") return amt;
  if (t === "received" || t === "owed") return -amt;
  return 0;
}
/** Effect on cash in hand. Credit/owed entries are not cash movements. */
export function cashEffect(t: TxType, amt: number) {
  if (t === "received" || t === "income") return amt;
  if (t === "paid" || t === "expense") return -amt;
  return 0;
}

const empty = (): DB => ({
  version: 1,
  customers: [],
  txs: [],
  audit: [],
  settings: { shopName: "আমার দোকান", dark: false },
});

let db: DB = empty();
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) db = { ...empty(), ...JSON.parse(raw) };
  } catch {
    // keep a copy of unreadable data instead of overwriting it
    const raw = localStorage.getItem(KEY);
    if (raw) localStorage.setItem(KEY + "-corrupt-" + Date.now(), raw);
  }
  try {
    navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}

// ---------- storage backends ----------
// Android app: SQLite is the source of truth (localStorage kept as a secondary mirror).
// Web/PWA: localStorage.
let native = false;
let writeQueue: Promise<void> = Promise.resolve();
const errorListeners = new Set<(msg: string) => void>();
export const onStorageError = (fn: (msg: string) => void) => {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
};
export const storageKind = () => (native ? "SQLite" : "browser");

export async function initStorage() {
  load();
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const store = await import("./sqlite-store");
  const fromSql = await store.loadAll();
  native = true;
  if (fromSql) {
    db = { ...empty(), ...fromSql, settings: { ...empty().settings, ...fromSql.settings } };
    listeners.forEach((l) => l());
  } else if (db.customers.length || db.txs.length) {
    await store.persistDiff(empty(), db); // one-time migration from earlier localStorage data
  }
}

function commit(next: DB) {
  const prev = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    if (!native) throw e; // on web, refuse the change if it can't be saved
  }
  db = next;
  listeners.forEach((l) => l());
  if (native) {
    writeQueue = writeQueue.then(async () => {
      try {
        const store = await import("./sqlite-store");
        await store.persistDiff(prev, next);
      } catch {
        errorListeners.forEach((f) => f("ডাটাবেসে সংরক্ষণ ব্যর্থ — অ্যাপ বন্ধ করবেন না, আবার চেষ্টা করুন"));
      }
    });
  }
}

export function subscribeDB(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function getDB() {
  load();
  return db;
}

const serverSnap = empty();
export function useDB() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getDB,
    () => serverSnap,
  );
}

export const uid = () =>
  (crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- customers ----------
export function saveCustomer(c: Omit<Customer, "id" | "createdAt" | "updatedAt"> & { id?: string | undefined }) {
  const d = getDB();
  const now = Date.now();
  if (c.id) {
    const prev = d.customers.find((x) => x.id === c.id)!;
    commit({
      ...d,
      customers: d.customers.map((x) => (x.id === c.id ? { ...prev, ...c, id: prev.id, updatedAt: now } : x)),
      audit: [...d.audit, { id: uid(), at: now, action: "edit", entity: "customer", entityId: prev.id, before: prev }],
    });
    return prev.id;
  }
  const id = uid();
  commit({ ...d, customers: [...d.customers, { ...c, id, createdAt: now, updatedAt: now }] });
  return id;
}

export function deleteCustomer(id: string) {
  const d = getDB();
  const now = Date.now();
  commit({
    ...d,
    customers: d.customers.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x)),
    txs: d.txs.map((t) => (t.customerId === id && !t.deletedAt ? { ...t, deletedAt: now, updatedAt: now } : t)),
    audit: [...d.audit, { id: uid(), at: now, action: "delete", entity: "customer", entityId: id }],
  });
}

// ---------- transactions ----------
export function saveTx(t: Omit<Tx, "id" | "createdAt" | "updatedAt"> & { id?: string | undefined }) {
  if (!(t.amount > 0) || !isFinite(t.amount)) throw new Error("সঠিক টাকার পরিমাণ দিন");
  t.amount = Math.round(t.amount * 100) / 100;
  const d = getDB();
  const now = Date.now();
  if (t.id) {
    const prev = d.txs.find((x) => x.id === t.id)!;
    commit({
      ...d,
      txs: d.txs.map((x) => (x.id === t.id ? { ...prev, ...t, id: prev.id, updatedAt: now } : x)),
      audit: [...d.audit, { id: uid(), at: now, action: "edit", entity: "tx", entityId: prev.id, before: prev }],
    });
    return;
  }
  commit({ ...d, txs: [...d.txs, { ...t, id: uid(), createdAt: now, updatedAt: now }] });
}

/** Detects an identical entry saved in the last 60 seconds. */
export function isLikelyDuplicate(t: { customerId?: string | undefined; type: TxType; amount: number }) {
  const now = Date.now();
  return getDB().txs.some(
    (x) => !x.deletedAt && x.customerId === t.customerId && x.type === t.type && x.amount === t.amount && now - x.createdAt < 60000,
  );
}

export function deleteTx(id: string) {
  const d = getDB();
  const now = Date.now();
  const prev = d.txs.find((x) => x.id === id);
  commit({
    ...d,
    txs: d.txs.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x)),
    audit: [...d.audit, { id: uid(), at: now, action: "delete", entity: "tx", entityId: id, before: prev }],
  });
}

// ---------- derived ----------
export const activeCustomers = (d: DB) => d.customers.filter((c) => !c.deletedAt);
export const activeTxs = (d: DB) => d.txs.filter((t) => !t.deletedAt);

export function customerBalance(d: DB, id: string) {
  const c = d.customers.find((x) => x.id === id);
  let b = c?.openingBalance ?? 0;
  for (const t of d.txs) if (!t.deletedAt && t.customerId === id) b += balanceEffect(t.type, t.amount);
  return Math.round(b * 100) / 100;
}

/** Ledger rows with running balance, oldest first. */
export function customerLedger(d: DB, id: string) {
  const c = d.customers.find((x) => x.id === id);
  let bal = c?.openingBalance ?? 0;
  return activeTxs(d)
    .filter((t) => t.customerId === id)
    .sort((a, b) => a.date - b.date || a.createdAt - b.createdAt)
    .map((t) => {
      const before = bal;
      bal = Math.round((bal + balanceEffect(t.type, t.amount)) * 100) / 100;
      return { tx: t, before, after: bal };
    });
}

export function setSettings(s: Partial<Settings>) {
  const d = getDB();
  commit({ ...d, settings: { ...d.settings, ...s } });
}

// ---------- PIN ----------
async function sha(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function setPin(pin: string | null) {
  if (!pin) return setSettings({ pinHash: undefined, pinSalt: undefined });
  const salt = uid();
  setSettings({ pinSalt: salt, pinHash: await sha(salt + pin) });
}
export async function checkPin(pin: string) {
  const s = getDB().settings;
  return !!s.pinHash && (await sha((s.pinSalt ?? "") + pin)) === s.pinHash;
}

// ---------- backup ----------
export function exportBackup() {
  const d = getDB();
  const { pinHash, pinSalt, ...settings } = d.settings;
  void pinHash;
  void pinSalt;
  return JSON.stringify({ app: "tali-khata", exportedAt: Date.now(), data: { ...d, settings } }, null, 1);
}

export function parseBackup(text: string): DB {
  const j = JSON.parse(text);
  const data = j?.data;
  if (j?.app !== "tali-khata" || !Array.isArray(data?.customers) || !Array.isArray(data?.txs))
    throw new Error("এটি সঠিক সহজ হিসাব খাতা ব্যাকআপ ফাইল নয়");
  for (const c of data.customers) if (typeof c.id !== "string" || typeof c.name !== "string") throw new Error("গ্রাহকের তথ্য ভুল");
  for (const t of data.txs)
    if (typeof t.id !== "string" || !(t.type in TX_LABEL) || typeof t.amount !== "number") throw new Error("লেনদেনের তথ্য ভুল");
  return data as DB;
}

/** Merge by ID: newer updatedAt wins, so restoring twice never duplicates. */
export function restoreBackup(b: DB, mode: "merge" | "replace") {
  const d = getDB();
  const merge = <T extends { id: string; updatedAt: number }>(a: T[], n: T[]) => {
    const m = new Map(a.map((x) => [x.id, x]));
    for (const x of n) {
      const cur = m.get(x.id);
      if (!cur || (x.updatedAt ?? 0) > (cur.updatedAt ?? 0)) m.set(x.id, x);
    }
    return [...m.values()];
  };
  const base = mode === "replace" ? { customers: [], txs: [] } : d;
  commit({
    ...d,
    customers: merge(base.customers as Customer[], b.customers),
    txs: merge(base.txs as Tx[], b.txs),
    audit: [...d.audit, { id: uid(), at: Date.now(), action: "restore-backup", entity: "tx", entityId: mode }],
    settings: { ...d.settings, shopName: b.settings?.shopName ?? d.settings.shopName },
  });
}

// ---------- formatting ----------
const nf = new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 2 });
export const taka = (n: number) => (n < 0 ? "-" : "") + "৳" + nf.format(Math.abs(n));
export const bnDate = (ms: number) =>
  new Date(ms).toLocaleString("bn-BD", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
export const bnDay = (ms: number) => new Date(ms).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" });
const bnNum = (n: number) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
export function bnTimeAgo(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return "এইমাত্র";
  const m = Math.floor(s / 60);
  if (m < 60) return `${bnNum(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${bnNum(h)} ঘণ্টা আগে`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${bnNum(d)} দিন আগে`;
  if (d < 365) return `${bnNum(Math.floor(d / 30))} মাস আগে`;
  return `${bnNum(Math.floor(d / 365))} বছর আগে`;
}

export function startOfDay(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function shareOrDownload(name: string, content: string, mime: string) {
  if (native) {
    // Android app: save to the Documents folder, then open Android's share sheet
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Filesystem.writeFile({ path: "TaliKhata/" + name, data: content, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    } catch {
      /* Documents may be unavailable; cache copy is still shared */
    }
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    try {
      await Share.share({ title: name, url: uri, dialogTitle: name });
    } catch {
      /* user closed share sheet */
    }
    return;
  }
  const file = new File([content], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch {
      /* user cancelled — fall back */
    }
  }
  downloadFile(name, content, mime);
}

export function toCSV(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
