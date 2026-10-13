import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, BarChart3, Pencil, Phone, Plus, Printer, Search, Share2, Trash2, UserPlus, Wallet } from "lucide-react";
import {
  TX_LABEL, activeCustomers, activeTxs, bnDate, bnDay, cashEffect, customerBalance, customerLedger, deleteCustomer,
  exportBackup, parseBackup, restoreBackup, setPin, setSettings, shareOrDownload, startOfDay, taka, toCSV, useDB,
  bnTimeAgo, type DB, type Tx, type TxType,
} from "@/lib/ledger";
import { CustomerForm } from "./forms";
import { getRecovery, recoverFrom, setupRecovery, stopRecovery, uploadNow, validInputs } from "@/lib/cloud-backup";
import { Label, Stat } from "./ui";

export type Open = (o: { kind: "tx"; type?: TxType; customerId?: string; tx?: Tx } | { kind: "customer" } | { kind: "tab"; tab: string }) => void;

const toneOf = (t: TxType) => (t === "received" || t === "income" ? "text-success" : t === "paid" || t === "expense" ? "text-danger" : t === "credit" ? "text-danger" : "text-success");

function TxRow({ t, db, onEdit }: { t: Tx; db: DB; onEdit?: () => void }) {
  const c = t.customerId ? db.customers.find((x) => x.id === t.customerId) : undefined;
  return (
    <button onClick={onEdit} className="flex w-full items-center justify-between gap-3 border-b px-1 py-3 text-left last:border-0">
      <div className="min-w-0">
        <div className="truncate font-semibold">{c?.name ?? TX_LABEL[t.type]}</div>
        <div className="truncate text-xs text-muted-foreground">
          {TX_LABEL[t.type]} · {bnDate(t.date)}{t.description ? ` · ${t.description}` : ""}
        </div>
      </div>
      <div className={`shrink-0 font-bold ${toneOf(t.type)}`}>{taka(t.amount)}</div>
    </button>
  );
}

// ---------------- Home ----------------
export function Home({ open }: { open: Open }) {
  const db = useDB();
  const s = useMemo(() => {
    const cs = activeCustomers(db);
    let recv = 0, pay = 0;
    for (const c of cs) {
      const b = customerBalance(db, c.id);
      if (b > 0) recv += b; else pay -= b;
    }
    const today = startOfDay();
    const tx = activeTxs(db);
    const sum = (types: TxType[], from = today) => tx.filter((t) => t.date >= from && types.includes(t.type)).reduce((a, t) => a + t.amount, 0);
    const cash = tx.reduce((a, t) => a + cashEffect(t.type, t.amount), 0);
    const todayNet = tx.filter((t) => t.date >= today).reduce((a, t) => a + cashEffect(t.type, t.amount), 0);
    return { count: cs.length, recv, pay, inToday: sum(["received"]), outToday: sum(["paid"]), incToday: sum(["income"]), expToday: sum(["expense"]), cash, todayNet, recent: [...tx].sort((a, b) => b.date - a.date).slice(0, 8) };
  }, [db]);

  const quick = [
    { label: "গ্রাহক যোগ", icon: UserPlus, on: () => open({ kind: "customer" }) },
    { label: "টাকা পেলাম", icon: ArrowDownLeft, on: () => open({ kind: "tx", type: "received" }) },
    { label: "বাকি দিলাম", icon: ArrowUpRight, on: () => open({ kind: "tx", type: "credit" }) },
    { label: "খরচ", icon: Wallet, on: () => open({ kind: "tx", type: "expense" }) },
    { label: "রিপোর্ট", icon: BarChart3, on: () => open({ kind: "tab", tab: "reports" }) },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="মোট পাবো (গ্রাহকের কাছে)" value={taka(s.recv)} tone="danger" />
        <Stat label="মোট দেবো (গ্রাহককে)" value={taka(s.pay)} tone="success" />
        <Stat label="হাতে নগদ" value={taka(s.cash)} tone={s.cash >= 0 ? "success" : "danger"} />
        <Stat label="মোট গ্রাহক" value={s.count.toLocaleString("bn-BD")} />
      </div>
      <div className="flex justify-between overflow-x-auto gap-2">
        {quick.map((q) => (
          <button key={q.label} onClick={q.on} className="flex min-w-16 flex-1 flex-col items-center gap-1 rounded-xl bg-card border p-2 text-xs font-medium">
            <q.icon className="h-5 w-5 text-primary" />{q.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-3">
        <h3 className="mb-2 font-bold">আজকের হিসাব</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span>টাকা পেলাম</span><span className="text-right font-semibold text-success">{taka(s.inToday)}</span>
          <span>টাকা দিলাম</span><span className="text-right font-semibold text-danger">{taka(s.outToday)}</span>
          <span>আয়</span><span className="text-right font-semibold text-success">{taka(s.incToday)}</span>
          <span>খরচ</span><span className="text-right font-semibold text-danger">{taka(s.expToday)}</span>
          <span className="border-t pt-2 font-bold">নিট নগদ</span><span className={`border-t pt-2 text-right font-bold ${s.todayNet >= 0 ? "text-success" : "text-danger"}`}>{taka(s.todayNet)}</span>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-3">
        <h3 className="mb-1 font-bold">সাম্প্রতিক লেনদেন</h3>
        {s.recent.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">এখনো কোনো লেনদেন নেই</p> : s.recent.map((t) => <TxRow key={t.id} t={t} db={db} onEdit={() => open({ kind: "tx", tx: t })} />)}
      </div>
    </div>
  );
}

// ---------------- Customers ----------------
export function Customers({ onSelect, open }: { onSelect: (id: string) => void; open: Open }) {
  const db = useDB();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const last = new Map<string, number>();
    for (const t of db.txs) {
      if (!t.customerId || t.deletedAt) continue;
      last.set(t.customerId, Math.max(last.get(t.customerId) ?? 0, t.updatedAt));
    }
    return activeCustomers(db)
      .filter((c) => !s || c.name.toLowerCase().includes(s) || c.phone.includes(s))
      .map((c) => ({ c, b: customerBalance(db, c.id), at: Math.max(c.updatedAt, last.get(c.id) ?? 0) }))
      .sort((a, b) => b.at - a.at);
  }, [db, q]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <input className="field pl-10" placeholder="নাম বা ফোন দিয়ে খুঁজুন" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="rounded-xl border bg-card">
        {list.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            কোনো গ্রাহক নেই
            <button className="btn mx-auto mt-3 flex bg-primary text-primary-foreground" onClick={() => open({ kind: "customer" })}><UserPlus className="h-4 w-4" />গ্রাহক যোগ করুন</button>
          </div>
        )}
        {list.map(({ c, b, at }) => (
          <button key={c.id} onClick={() => onSelect(c.id)} className="flex w-full items-center gap-3 border-b px-3 py-3 text-left last:border-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground">{c.name.slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{c.name}</div>
              <div className="truncate text-xs text-muted-foreground">{bnTimeAgo(at)}</div>
            </div>
            <div className="text-right">
              <div className={`font-bold ${b > 0 ? "text-danger" : b < 0 ? "text-success" : "text-muted-foreground"}`}>{taka(Math.abs(b))}</div>
              <div className="text-[11px] text-muted-foreground">{b > 0 ? "পাবো" : b < 0 ? "দেবো" : "পরিশোধিত"}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CustomerDetail({ id, onBack, open }: { id: string; onBack: () => void; open: Open }) {
  const db = useDB();
  const [edit, setEdit] = useState(false);
  const c = db.customers.find((x) => x.id === id);
  if (!c || c.deletedAt) return <p className="p-6 text-center">গ্রাহক পাওয়া যায়নি</p>;
  const bal = customerBalance(db, id);
  const rows = customerLedger(db, id);
  const share = () => {
    const lines = [`${db.settings.shopName} — ${c.name} এর খাতা`, `শুরুর ব্যালেন্স: ${taka(c.openingBalance)}`, ...rows.map((r) => `${bnDay(r.tx.date)} ${TX_LABEL[r.tx.type]} ${taka(r.tx.amount)} → ${taka(r.after)}`), `বর্তমান ব্যালেন্স: ${taka(bal)} ${bal > 0 ? "(বাকি)" : bal < 0 ? "(আপনার পাওনা)" : ""}`];
    const text = lines.join("\n");
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { navigator.clipboard?.writeText(text); toast.success("কপি হয়েছে"); }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{c.name}</h2>
            {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-sm text-primary"><Phone className="h-3.5 w-3.5" />{c.phone}</a>}
            {c.address && <div className="text-sm text-muted-foreground">{c.address}</div>}
            {c.notes && <div className="mt-1 text-xs text-muted-foreground">{c.notes}</div>}
          </div>
          <div className="no-print flex gap-1">
            <button aria-label="সম্পাদনা" className="rounded-lg border p-2" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /></button>
            <button aria-label="মুছুন" className="rounded-lg border p-2 text-danger" onClick={() => {
              if (!confirm(`"${c.name}" ও তার সব লেনদেন মুছে ফেলবেন?`)) return;
              if (prompt('নিশ্চিত করতে "মুছুন" লিখুন') !== "মুছুন") return;
              deleteCustomer(id); toast.success("মুছে ফেলা হয়েছে"); onBack();
            }}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        <div className={`mt-4 rounded-lg p-3 text-center ${bal > 0 ? "bg-danger-soft text-danger" : bal < 0 ? "bg-success-soft text-success" : "bg-muted"}`}>
          <div className="text-xs">{bal > 0 ? "আমি পাবো" : bal < 0 ? "গ্রাহক পাবে" : "হিসাব পরিশোধিত"}</div>
          <div className="text-2xl font-bold">{taka(Math.abs(bal))}</div>
        </div>
        <div className="no-print mt-3 grid grid-cols-2 gap-3">
          <button className="btn py-4 text-xl bg-danger text-primary-foreground" onClick={() => open({ kind: "tx", type: "credit", customerId: id })}>দিলাম</button>
          <button className="btn py-4 text-xl bg-success text-primary-foreground" onClick={() => open({ kind: "tx", type: "received", customerId: id })}>পেলাম</button>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold">খাতা</h3>
          <div className="no-print flex gap-2">
            <button className="btn border px-2 py-1 text-sm" onClick={share}><Share2 className="h-4 w-4" />শেয়ার</button>
            <button className="btn border px-2 py-1 text-sm" onClick={() => window.print()}><Printer className="h-4 w-4" />প্রিন্ট</button>
          </div>
        </div>
        <div className="flex justify-between border-b py-2 text-sm text-muted-foreground"><span>শুরুর ব্যালেন্স</span><span>{taka(c.openingBalance)}</span></div>
        {[...rows].reverse().map(({ tx, before, after }) => (
          <button key={tx.id} onClick={() => open({ kind: "tx", tx })} className="w-full border-b py-2 text-left text-sm last:border-0">
            <div className="flex justify-between gap-2"><span className="text-base font-semibold">{tx.description || TX_LABEL[tx.type]}</span><span className={`font-bold ${toneOf(tx.type)}`}>{taka(tx.amount)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>{TX_LABEL[tx.type]} · {bnDate(tx.date)}</span><span>{taka(before)} → {taka(after)}</span></div>
          </button>
        ))}
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">কোনো লেনদেন নেই</p>}
      </div>
      {edit && <CustomerForm open customer={c} onClose={() => setEdit(false)} />}
    </div>
  );
}

// ---------------- Transactions ----------------
export function Transactions({ open }: { open: Open }) {
  const db = useDB();
  const [cust, setCust] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const f = from ? new Date(from).setHours(0, 0, 0, 0) : 0;
    const t = to ? new Date(to).setHours(23, 59, 59, 999) : Infinity;
    const s = q.trim().toLowerCase();
    return activeTxs(db)
      .filter((x) => (!cust || x.customerId === cust) && (!type || x.type === type) && x.date >= f && x.date <= t && (!s || x.description.toLowerCase().includes(s) || x.reference.toLowerCase().includes(s)))
      .sort((a, b) => b.date - a.date);
  }, [db, cust, type, from, to, q]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3">
        <select className="field" value={cust} onChange={(e) => setCust(e.target.value)}>
          <option value="">সব গ্রাহক</option>
          {activeCustomers(db).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">সব ধরন</option>
          {Object.entries(TX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="শুরু" />
        <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} aria-label="শেষ" />
        <input className="field col-span-2" placeholder="বিবরণ খুঁজুন" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="rounded-xl border bg-card px-3">
        {list.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">কোনো লেনদেন পাওয়া যায়নি</p> : list.map((t) => <TxRow key={t.id} t={t} db={db} onEdit={() => open({ kind: "tx", tx: t })} />)}
      </div>
    </div>
  );
}

// ---------------- Reports ----------------
export function Reports() {
  const db = useDB();
  const [range, setRange] = useState<"day" | "week" | "month" | "custom">("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const now = Date.now();
  const start = range === "day" ? startOfDay() : range === "week" ? startOfDay(now - 6 * 864e5) : range === "month" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() : from ? new Date(from).setHours(0, 0, 0, 0) : 0;
  const end = range === "custom" && to ? new Date(to).setHours(23, 59, 59, 999) : Infinity;
  const txs = activeTxs(db).filter((t) => t.date >= start && t.date <= end).sort((a, b) => a.date - b.date);
  const tot = (k: TxType) => txs.filter((t) => t.type === k).reduce((a, t) => a + t.amount, 0);
  const balances = activeCustomers(db).map((c) => ({ c, b: customerBalance(db, c.id) })).filter((x) => x.b !== 0).sort((a, b) => b.b - a.b);
  const exportCSV = () => {
    const rows: (string | number)[][] = [["তারিখ", "গ্রাহক", "ধরন", "পরিমাণ", "বিবরণ", "রেফারেন্স"]];
    for (const t of txs) rows.push([new Date(t.date).toLocaleString("en-GB"), db.customers.find((c) => c.id === t.customerId)?.name ?? "", TX_LABEL[t.type], t.amount, t.description, t.reference]);
    shareOrDownload(`tali-khata-report-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), "text/csv");
  };
  const exportBal = () => {
    const rows: (string | number)[][] = [["গ্রাহক", "ফোন", "ব্যালেন্স", "অবস্থা"], ...balances.map(({ c, b }) => [c.name, c.phone, Math.abs(b), b > 0 ? "পাবো" : "দেবো"])];
    shareOrDownload(`tali-khata-balances.csv`, toCSV(rows), "text/csv");
  };
  return (
    <div className="space-y-3">
      <div className="no-print grid grid-cols-4 gap-1 rounded-xl border bg-card p-1">
        {([["day", "আজ"], ["week", "৭ দিন"], ["month", "এই মাস"], ["custom", "নির্দিষ্ট"]] as const).map(([k, v]) => (
          <button key={k} onClick={() => setRange(k)} className={`btn px-1 py-2 text-sm ${range === k ? "bg-primary text-primary-foreground" : ""}`}>{v}</button>
        ))}
      </div>
      {range === "custom" && (
        <div className="no-print grid grid-cols-2 gap-2">
          <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="টাকা পেলাম" value={taka(tot("received"))} tone="success" />
        <Stat label="টাকা দিলাম" value={taka(tot("paid"))} tone="danger" />
        <Stat label="বাকি দিলাম" value={taka(tot("credit"))} tone="danger" />
        <Stat label="গ্রাহকের পাওনা" value={taka(tot("owed"))} tone="success" />
        <Stat label="আয়" value={taka(tot("income"))} tone="success" />
        <Stat label="খরচ" value={taka(tot("expense"))} tone="danger" />
      </div>
      <Stat label={`নিট নগদ (${txs.length.toLocaleString("bn-BD")}টি লেনদেন)`} value={taka(txs.reduce((a, t) => a + cashEffect(t.type, t.amount), 0))} />
      <div className="no-print grid grid-cols-3 gap-2">
        <button className="btn border bg-card text-sm" onClick={exportCSV}>লেনদেন CSV</button>
        <button className="btn border bg-card text-sm" onClick={exportBal}>ব্যালেন্স CSV</button>
        <button className="btn border bg-card text-sm" onClick={() => window.print()}><Printer className="h-4 w-4" />PDF</button>
      </div>
      <div className="rounded-xl border bg-card p-3">
        <h3 className="mb-2 font-bold">গ্রাহকভিত্তিক বকেয়া</h3>
        {balances.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">কোনো বকেয়া নেই</p>}
        {balances.map(({ c, b }) => (
          <div key={c.id} className="flex justify-between border-b py-2 text-sm last:border-0">
            <span>{c.name}</span>
            <span className={`font-bold ${b > 0 ? "text-danger" : "text-success"}`}>{taka(Math.abs(b))} {b > 0 ? "পাবো" : "দেবো"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Settings ----------------
export function Settings() {
  const db = useDB();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pin, setPinVal] = useState("");
  const backup = async () => {
    await shareOrDownload(`tali-khata-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(), "application/json");
    setSettings({ lastBackupAt: Date.now() });
    toast.success("ব্যাকআপ তৈরি হয়েছে");
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const data = parseBackup(await f.text());
      const msg = `ব্যাকআপে ${data.customers.length}জন গ্রাহক ও ${data.txs.length}টি লেনদেন আছে।\n\nOK = বর্তমান তথ্যের সাথে মিলিয়ে নিন (ডুপ্লিকেট হবে না)\nCancel = বাতিল`;
      if (!confirm(msg)) return;
      restoreBackup(data, "merge");
      toast.success("রিস্টোর সম্পন্ন");
    } catch (e) {
      toast.error((e as Error).message || "ফাইল পড়া যায়নি");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const days = db.settings.lastBackupAt ? Math.floor((Date.now() - db.settings.lastBackupAt) / 864e5) : null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-4">
        <Label>দোকানের নাম</Label>
        <input className="field" defaultValue={db.settings.shopName} onBlur={(e) => setSettings({ shopName: e.target.value.trim() || "আমার দোকান" })} />
        <label className="mt-4 flex items-center justify-between">
          <span className="font-medium">ডার্ক মোড</span>
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={db.settings.dark} onChange={(e) => setSettings({ dark: e.target.checked })} />
        </label>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-bold">ব্যাকআপ ও রিস্টোর</h3>
        <p className={`mt-1 text-sm ${days === null || days > 7 ? "text-danger" : "text-success"}`}>
          {days === null ? "এখনো কোনো ব্যাকআপ নেওয়া হয়নি" : `শেষ ব্যাকআপ: ${bnDate(db.settings.lastBackupAt!)}`}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn bg-primary text-primary-foreground" onClick={backup}>ব্যাকআপ নিন</button>
          <button className="btn border" onClick={() => fileRef.current?.click()}>রিস্টোর করুন</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <p className="mt-3 text-xs text-muted-foreground">ফাইল ব্যাকআপ শুধু এই ফোনে থাকে। অ্যাপ মুছে ফেললে বা ব্রাউজারের ডাটা ক্লিয়ার করলে তথ্য হারিয়ে যাবে — নিয়মিত ব্যাকআপ নিয়ে ফাইলটি Google Drive / WhatsApp এ রেখে দিন।</p>
      </div>
      <CloudRecovery />
      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-bold">পিন লক</h3>
        <p className="text-sm text-muted-foreground">{db.settings.pinHash ? "পিন চালু আছে" : "পিন বন্ধ"}</p>
        <div className="mt-2 flex gap-2">
          <input className="field" type="password" inputMode="numeric" maxLength={6} placeholder="৪-৬ সংখ্যা" value={pin} onChange={(e) => setPinVal(e.target.value.replace(/\D/g, ""))} />
          <button className="btn bg-primary text-primary-foreground" onClick={async () => { if (pin.length < 4) return void toast.error("কমপক্ষে ৪ সংখ্যা"); await setPin(pin); setPinVal(""); toast.success("পিন সেট হয়েছে"); }}>সেট</button>
        </div>
        {db.settings.pinHash && <button className="btn mt-2 border text-danger" onClick={() => confirm("পিন বন্ধ করবেন?") && setPin(null)}>পিন বন্ধ করুন</button>}
        <p className="mt-2 text-xs text-muted-foreground">পিন শুধু অ্যাপ খোলা আটকায়; এটি তথ্য এনক্রিপ্ট করে না।</p>
      </div>
      <div className="rounded-xl border bg-card p-4 text-sm">
        <h3 className="font-bold">ফোনে অ্যাপ হিসেবে ইনস্টল</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Chrome দিয়ে অ্যাপের লিংকটি খুলুন</li>
          <li>উপরের ⋮ মেনু চাপুন → "Add to Home screen / অ্যাপ ইনস্টল করুন"</li>
          <li>একবার খোলার পর ইন্টারনেট ছাড়াই চলবে</li>
        </ol>
      </div>
      <p className="pb-2 text-center text-xs text-muted-foreground"><Plus className="inline h-3 w-3" /> সহজ হিসাব খাতা · সংস্করণ ১.০</p>
    </div>
  );
}

function CloudRecovery() {
  const [rec, setRec] = useState(() => (typeof window === "undefined" ? null : getRecovery()));
  const [phone, setPhone] = useState("");
  const [nid, setNid] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (!validInputs(phone, nid)) return void toast.error("সঠিক ১১ সংখ্যার মোবাইল নম্বর ও NID নম্বর দিন");
    setBusy(true);
    try { await fn(); toast.success(ok); setRec(getRecovery()); setNid(""); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="font-bold">অনলাইন ব্যাকআপ (মোবাইল + NID)</h3>
      {rec ? (
        <>
          <p className="mt-1 text-sm text-success">চালু আছে — {rec.phone}</p>
          <p className="text-xs text-muted-foreground">
            {rec.lastSync ? `শেষ আপলোড: ${bnDate(rec.lastSync)}` : "এখনো আপলোড হয়নি"} · ইন্টারনেট পেলে নিজে থেকেই আপলোড হয়
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn bg-primary text-primary-foreground" disabled={busy}
              onClick={async () => { setBusy(true); try { await uploadNow(); setRec(getRecovery()); toast.success("আপলোড হয়েছে"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>
              এখনই আপলোড
            </button>
            <button className="btn border text-danger" onClick={() => confirm("অনলাইন ব্যাকআপ বন্ধ করবেন?") && (stopRecovery(), setRec(null))}>বন্ধ করুন</button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">অ্যাপ মুছে গেলে বা নতুন ফোনে, একই নম্বর ও NID দিয়ে সব হিসাব ফিরে পাবেন।</p>
      )}
      <div className="mt-3 space-y-2">
        <input className="field" inputMode="tel" placeholder="মোবাইল নম্বর (01XXXXXXXXX)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="field" inputMode="numeric" type="password" placeholder="NID নম্বর" value={nid} onChange={(e) => setNid(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          {!rec && (
            <button className="btn bg-primary text-primary-foreground" disabled={busy} onClick={() => run(() => setupRecovery(phone, nid), "অনলাইন ব্যাকআপ চালু হয়েছে")}>ব্যাকআপ চালু করুন</button>
          )}
          <button className={`btn border ${rec ? "col-span-2" : ""}`} disabled={busy} onClick={() => run(() => recoverFrom(phone, nid), "আগের সব হিসাব ফিরে এসেছে")}>আগের তথ্য নিয়ে আসুন</button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">নম্বর ও NID মনে রাখুন — এগুলোই আপনার হিসাবের চাবি। NID কাউকে দেবেন না। ইন্টারনেট লাগবে শুধু আপলোড ও ফেরত আনার সময়।</p>
    </div>
  );
}
