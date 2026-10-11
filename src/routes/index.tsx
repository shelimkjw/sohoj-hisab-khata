import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Home as HomeIcon, ListOrdered, Lock, Plus, Settings as Cog, Users, BarChart3, Wifi, WifiOff } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { checkPin, initStorage, onStorageError, useDB, type Tx, type TxType } from "@/lib/ledger";
import { registerPWA } from "@/lib/pwa";
import { CustomerForm, TxForm } from "@/components/khata/forms";
import { CustomerDetail, Customers, Home, Reports, Settings, Transactions, type Open } from "@/components/khata/screens";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "তালি খাতা — অফলাইন বাকির খাতা" },
      { name: "description", content: "তালি খাতা: গ্রাহকের বাকি, টাকা পাওয়া-দেওয়া, আয়-খরচ — সব ফোনেই, ইন্টারনেট ছাড়া।" },
      { property: "og:title", content: "তালি খাতা — অফলাইন বাকির খাতা" },
      { property: "og:description", content: "সহজ বাংলা হিসাব খাতা, সম্পূর্ণ অফলাইন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: App,
});

const TABS = [
  { id: "home", label: "হোম", icon: HomeIcon },
  { id: "customers", label: "গ্রাহক", icon: Users },
  { id: "transactions", label: "লেনদেন", icon: ListOrdered },
  { id: "reports", label: "রিপোর্ট", icon: BarChart3 },
  { id: "settings", label: "সেটিংস", icon: Cog },
];

function PinLock({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const submit = async (p: string) => {
    if (await checkPin(p)) onOk();
    else { setErr(true); setPin(""); }
  };
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
      <Lock className="h-10 w-10 text-primary" />
      <h1 className="text-xl font-bold">পিন দিন</h1>
      <input autoFocus className="field max-w-48 text-center text-2xl tracking-widest" type="password" inputMode="numeric" maxLength={6} value={pin}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setPin(v); setErr(false); if (v.length >= 4) void checkPin(v).then((ok) => ok && onOk()); }}
        onKeyDown={(e) => e.key === "Enter" && submit(pin)} />
      {err && <p className="text-sm text-danger">ভুল পিন</p>}
      <button className="btn bg-primary text-primary-foreground" onClick={() => submit(pin)}>খুলুন</button>
    </div>
  );
}

function App() {
  const db = useDB();
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState("home");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [txOpen, setTxOpen] = useState<null | { type?: TxType | undefined; customerId?: string | undefined; tx?: Tx | undefined; key: number }>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    initStorage()
      .catch(() => toast.error("ডাটাবেস খোলা যায়নি — অ্যাপ আবার চালু করুন"))
      .finally(() => setReady(true));
    const offErr = onStorageError((m) => toast.error(m));
    let removeBack: (() => void) | undefined;
    void import("@capacitor/core").then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      const { App: CapApp } = await import("@capacitor/app");
      const h = await CapApp.addListener("backButton", () => {
        if (history.state?.sheet || history.state?.detail) history.back();
        else void CapApp.exitApp();
      });
      removeBack = () => void h.remove();
    });
    setOnline(navigator.onLine);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    registerPWA();
    return () => { offErr(); removeBack?.(); window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);

  useEffect(() => { document.documentElement.classList.toggle("dark", db.settings.dark); }, [db.settings.dark]);

  // Android back button: leave customer detail
  useEffect(() => {
    if (!customerId) return;
    if (!history.state?.detail) history.pushState({ detail: true }, "");
    const onPop = (e: PopStateEvent) => { if (!e.state?.sheet && !e.state?.detail) setCustomerId(null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [customerId]);

  const open: Open = (o) => {
    if (o.kind === "tx") setTxOpen({ type: o.type, customerId: o.customerId, tx: o.tx, key: Date.now() });
    else if (o.kind === "customer") setCustOpen(true);
    else { setTab(o.tab); setCustomerId(null); }
  };

  if (!ready) return <div className="min-h-screen bg-background" />;
  if (db.settings.pinHash && !unlocked) return <PinLock onOk={() => setUnlocked(true)} />;

  const title = customerId ? "গ্রাহকের খাতা" : TABS.find((t) => t.id === tab)?.label;
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background pb-24">
      <header className="no-print sticky top-0 z-30 flex items-center gap-2 bg-primary px-4 py-3 text-primary-foreground">
        {customerId ? (
          <button aria-label="ফিরে যান" onClick={() => history.back()}><ArrowLeft className="h-5 w-5" /></button>
        ) : (
          <BookOpen className="h-5 w-5" />
        )}
        <div className="flex-1">
          <div className="text-lg font-bold leading-tight">{customerId ? title : "তালি খাতা"}</div>
          {!customerId && <div className="text-xs opacity-80">{db.settings.shopName} · {title}</div>}
        </div>
        <span className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2 py-0.5 text-xs">
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {online ? "অফলাইনে সংরক্ষিত" : "অফলাইন মোড"}
        </span>
      </header>

      <main className="p-4">
        {customerId ? <CustomerDetail id={customerId} onBack={() => history.back()} open={open} />
          : tab === "home" ? <Home open={open} />
          : tab === "customers" ? <Customers onSelect={setCustomerId} open={open} />
          : tab === "transactions" ? <Transactions open={open} />
          : tab === "reports" ? <Reports />
          : <Settings />}
      </main>

      {!customerId && (tab === "customers" || tab === "home" || tab === "transactions") && (
        <button aria-label="যোগ করুন" onClick={() => (tab === "customers" ? setCustOpen(true) : open({ kind: "tx" }))}
          className="no-print fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg">
          <Plus className="h-7 w-7" />
        </button>
      )}

      <nav className="no-print fixed bottom-0 left-0 right-0 z-30 border-t bg-card">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((t) => {
            const active = !customerId && tab === t.id;
            return (
              <button key={t.id} onClick={() => { if (customerId) history.back(); setTab(t.id); }} className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "text-primary font-bold" : "text-muted-foreground"}`}>
                <t.icon className="h-5 w-5" />{t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {txOpen && <TxForm key={txOpen.key} open tx={txOpen.tx} presetType={txOpen.type} presetCustomer={txOpen.customerId} onClose={() => setTxOpen(null)} />}
      {custOpen && <CustomerForm open onClose={() => setCustOpen(false)} onSaved={(id) => { setTab("customers"); setCustomerId(id); }} />}
      <Toaster position="top-center" />
    </div>
  );
}
