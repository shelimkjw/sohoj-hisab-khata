import { useEffect, useState } from "react";
import { Check, Clock, Copy, Download, Lock, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { isMaster } from "@/lib/activation";
import {
  adminDecide, adminList, adminSetRelease, APP_VERSION, deviceCode, getRelease, latestRequest, PAY_NUMBER, planLabel, PLANS,
  refreshLicense, setOwnerDevice, submitPayment, whatsappLink, type Latest, type PlanId, type Release, type Req,
} from "@/lib/license";

const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success("কপি হয়েছে"), () => toast.error("কপি করা যায়নি"));
const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 overflow-y-auto bg-background"><div className="mx-auto flex max-w-lg flex-col gap-4 p-5">{children}</div></div>
);

/** Shown when the trial/plan has ended and the user taps দিলাম/পেলাম. */
export function Paywall({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [latest, setLatest] = useState<Latest>(null);
  const [form, setForm] = useState(false);
  const [plan, setPlan] = useState<PlanId>("m1");
  const [payer, setPayer] = useState("");
  const [trx, setTrx] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (manual = false) => {
    const c = await refreshLicense();
    if (c && onUnlockedIfValid(c)) return;
    setLatest(c?.latest ?? latestRequest());
    if (manual && !c) toast.error("ইন্টারনেট সংযোগ নেই");
  };
  const onUnlockedIfValid = (c: { best: { expires_at: string | null } | null }) => {
    if (c.best && (c.best.expires_at === null || new Date(c.best.expires_at).getTime() > Date.now())) { toast.success("অনুমোদিত হয়েছে! এখন হিসাব করতে পারবেন"); onUnlocked(); return true; }
    return false;
  };
  useEffect(() => { setLatest(latestRequest()); void load(); }, []);

  const submit = async () => {
    const p = payer.replace(/\D/g, "");
    if (!/^01\d{9}$/.test(p)) { toast.error("সঠিক ১১ সংখ্যার নম্বর দিন"); return; }
    if (trx.trim().length < 6) { toast.error("সঠিক TrxID দিন"); return; }
    setBusy(true);
    try {
      await submitPayment(plan, p, trx);
      window.open(whatsappLink(plan, p, trx), "_blank");
      toast.success("জমা হয়েছে, যাচাইয়ের অপেক্ষায়");
      setForm(false); setLatest(latestRequest());
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const waiting = latest?.status === "pending" && !form;
  return (
    <Overlay>
      <div className="mt-2 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">{waiting ? <Clock className="h-7 w-7" /> : <Lock className="h-7 w-7" />}</span>
        <h1 className="mt-2 text-xl font-bold">{waiting ? "পেমেন্ট যাচাই করা হচ্ছে" : "হিসাব চালিয়ে যেতে প্যাকেজ নিন"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{waiting ? "অনুগ্রহ করে অপেক্ষা করুন। অনুমোদন হলেই আবার দিলাম/পেলাম করতে পারবেন।" : "আপনার ফ্রি সময় শেষ। আপনার সব পুরোনো হিসাব নিরাপদ আছে এবং দেখা যাবে।"}</p>
      </div>

      {waiting ? (
        <div className="rounded-2xl border bg-card p-4 text-sm">
          <div>প্যাকেজ: <b>{planLabel(latest.plan)}</b></div>
          <div>ডিভাইস: <b>{deviceCode()}</b></div>
          <button className="btn mt-3 flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground" onClick={() => load(true)}><RefreshCw className="h-4 w-4" /> অবস্থা দেখুন</button>
          <button className="btn mt-2 w-full border bg-card" onClick={() => setForm(true)}>তথ্য ভুল দিয়েছি — আবার জমা দিন</button>
        </div>
      ) : (
        <>
          {latest?.status === "rejected" && (
            <div className="rounded-2xl border border-danger bg-card p-3 text-sm text-danger">আপনার আগের পেমেন্ট বাতিল হয়েছে{latest.reason ? `: ${latest.reason}` : ""}। সঠিক নম্বর ও TrxID দিয়ে আবার জমা দিন।</div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {PLANS.map((p) => (
              <button key={p.id} onClick={() => setPlan(p.id)} className={`rounded-2xl border p-3 text-center ${p.id === "life" ? "col-span-2" : ""} ${plan === p.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
                <div className="font-bold">{p.label}</div><div className="text-lg">৳{p.price.toLocaleString("bn-BD")}</div>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border bg-card p-4 text-sm">
            <p>১. বিকাশ/নগদ থেকে <b>Send Money</b> করুন:</p>
            <div className="my-2 flex items-center justify-between rounded-xl bg-muted p-3"><span className="text-xl font-bold tracking-wider">{PAY_NUMBER}</span>
              <button className="inline-flex items-center gap-1 text-primary" onClick={() => copy(PAY_NUMBER)}><Copy className="h-4 w-4" /> কপি</button></div>
            <p>২. টাকা পাঠানোর পর নিচে তথ্য দিয়ে জমা দিন। আপনার তথ্য WhatsApp-এ চলে যাবে।</p>
            <input className="field mt-3" inputMode="numeric" placeholder="যে নম্বর থেকে টাকা পাঠিয়েছেন" value={payer} onChange={(e) => setPayer(e.target.value)} />
            <input className="field mt-2 uppercase" placeholder="ট্রানজেকশন আইডি (TrxID)" value={trx} onChange={(e) => setTrx(e.target.value)} />
            <button disabled={busy} className="btn mt-3 w-full bg-success text-primary-foreground" onClick={submit}>{busy ? "জমা হচ্ছে..." : "জমা দিন"}</button>
          </div>
        </>
      )}
      <button className="btn border bg-card" onClick={onClose}>পরে করব — পুরোনো হিসাব দেখি</button>
    </Overlay>
  );
}

/** Owner-only panel: opened by tapping the header logo three times. */
export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [pass, setPass] = useState("");
  const [key, setKey] = useState("");
  const [list, setList] = useState<Req[]>([]);
  const [rel, setRel] = useState<Release>({ version_code: 0, apk_url: "", notes: "", force: false });
  const load = async (k = key) => {
    try { setList(await adminList(k)); } catch (e) { toast.error((e as Error).message); }
    const r = await getRelease(); if (r) setRel(r);
  };
  const login = async () => {
    if (!(await isMaster(pass))) { toast.error("ভুল মাস্টার কি"); return; }
    setKey(pass.trim()); setOwnerDevice(); void load(pass.trim());
  };
  const decide = async (r: Req, ok: boolean) => {
    const reason = ok ? "" : (window.prompt("বাতিলের কারণ (যেমন: TrxID মিলেনি)") ?? "");
    try { await adminDecide(key, r.id, ok, reason); toast.success(ok ? "অনুমোদন দেওয়া হয়েছে" : "বাতিল করা হয়েছে"); void load(); } catch (e) { toast.error((e as Error).message); }
  };
  const statusBn: Record<string, string> = { pending: "অপেক্ষমাণ", approved: "অনুমোদিত", rejected: "বাতিল" };

  return (
    <Overlay>
      <div className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-6 w-6 text-primary" /> মালিকের এডমিন প্যানেল</div>
      {!key ? (
        <>
          <input className="field" type="password" placeholder="মাস্টার কি" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
          <button className="btn bg-primary text-primary-foreground" onClick={login}>প্রবেশ করুন</button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between"><h2 className="font-bold">পেমেন্ট আবেদন</h2>
            <button className="inline-flex items-center gap-1 text-sm text-primary" onClick={() => load()}><RefreshCw className="h-4 w-4" /> রিফ্রেশ</button></div>
          {list.length === 0 && <p className="text-sm text-muted-foreground">কোনো আবেদন নেই</p>}
          {list.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-3 text-sm">
              <div className="flex justify-between"><b>{r.device_code}</b><span className={r.status === "approved" ? "text-success" : r.status === "rejected" ? "text-danger" : "text-primary"}>{statusBn[r.status] ?? r.status}</span></div>
              <div>প্যাকেজ: {planLabel(r.plan)} · ৳{PLANS.find((p) => p.id === r.plan)?.price}</div>
              <div>নম্বর: {r.payer}</div>
              <div>TrxID: <b>{r.trx_id}</b></div>
              <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("bn-BD")}{r.status === "approved" && ` · মেয়াদ: ${r.expires_at ? new Date(r.expires_at).toLocaleDateString("bn-BD") : "আজীবন"}`}{r.reason ? ` · কারণ: ${r.reason}` : ""}</div>
              {r.status === "pending" && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="btn flex items-center justify-center gap-1 bg-success text-primary-foreground" onClick={() => decide(r, true)}><Check className="h-4 w-4" /> অনুমোদন</button>
                  <button className="btn flex items-center justify-center gap-1 bg-danger text-primary-foreground" onClick={() => decide(r, false)}><X className="h-4 w-4" /> বাতিল</button>
                </div>
              )}
            </div>
          ))}

          <div className="rounded-2xl border bg-card p-4 text-sm">
            <h2 className="mb-2 flex items-center gap-1 font-bold"><Download className="h-4 w-4" /> অ্যাপ আপডেট পাঠান</h2>
            <p className="text-xs text-muted-foreground">এই ফোনের ভার্সন: {APP_VERSION}। নতুন APK-এর ভার্সন নম্বর (GitHub রানের নম্বর) ও ডাউনলোড লিংক দিন। এর চেয়ে পুরোনো ভার্সনের সবার ফোনে আপডেট পপআপ আসবে।</p>
            <input className="field mt-2" inputMode="numeric" placeholder="ভার্সন নম্বর" value={rel.version_code || ""} onChange={(e) => setRel({ ...rel, version_code: Number(e.target.value.replace(/\D/g, "")) })} />
            <input className="field mt-2" placeholder="APK ডাউনলোড লিংক (https://...)" value={rel.apk_url} onChange={(e) => setRel({ ...rel, apk_url: e.target.value.trim() })} />
            <textarea className="field mt-2" placeholder="নতুন কী আছে" value={rel.notes} onChange={(e) => setRel({ ...rel, notes: e.target.value })} />
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={rel.force} onChange={(e) => setRel({ ...rel, force: e.target.checked })} /> জরুরি আপডেট (আপডেট না করলে অ্যাপ চলবে না)</label>
            <button className="btn mt-3 w-full bg-primary text-primary-foreground" onClick={async () => { try { await adminSetRelease(key, rel); toast.success("আপডেট প্রকাশ হয়েছে"); } catch (e) { toast.error((e as Error).message); } }}>আপডেট প্রকাশ করুন</button>
          </div>
        </>
      )}
      <button className="btn border bg-card" onClick={onClose}>ফিরে যান</button>
    </Overlay>
  );
}

/** Appears only when a newer version has been published from the admin panel. */
export function UpdatePopup() {
  const [rel, setRel] = useState<Release | null>(null);
  useEffect(() => {
    if (!APP_VERSION) return; // only real app builds know their version
    const check = () => navigator.onLine && void getRelease().then((r) => r && r.apk_url && r.version_code > APP_VERSION && setRel(r));
    check();
    window.addEventListener("online", check);
    return () => window.removeEventListener("online", check);
  }, []);
  if (!rel) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-5">
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 text-center shadow-xl">
        <Download className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-2 text-lg font-bold">নতুন আপডেট এসেছে!</h2>
        {rel.notes && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{rel.notes}</p>}
        <p className="mt-2 text-xs text-muted-foreground">আপডেট করলে আপনার কোনো হিসাব মুছবে না।</p>
        <a href={rel.apk_url} target="_blank" rel="noreferrer" className="btn mt-4 block w-full bg-primary text-primary-foreground">এখনই আপডেট করুন</a>
        {!rel.force && <button className="btn mt-2 w-full border bg-card" onClick={() => setRel(null)}>পরে</button>}
      </div>
    </div>
  );
}
