import { useEffect, useState } from "react";
import { BookOpen, Copy, Lock, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { deviceCode, isMaster, OWNER_PHONE, tryActivate, unlockCodeFor } from "@/lib/activation";

const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success("কপি হয়েছে"), () => toast.error("কপি করা যায়নি"));

export function ActivationScreen({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [err, setErr] = useState(false);
  const [taps, setTaps] = useState(0);
  const [admin, setAdmin] = useState(false);
  useEffect(() => setCode(deviceCode()), []);

  const msg = `আসসালামু আলাইকুম, আমি সহজ হিসাব খাতা অ্যাপটি সক্রিয় করতে চাই। আমার ডিভাইস কোড: ${code}`;
  const wa = `https://wa.me/88${OWNER_PHONE}?text=${encodeURIComponent(msg)}`;
  const submit = async () => {
    if (await tryActivate(input)) { toast.success("অভিনন্দন! অ্যাপটি আজীবনের জন্য সক্রিয় হয়েছে"); onDone(); }
    else setErr(true);
  };

  if (admin) return <AdminPanel onClose={() => setAdmin(false)} />;
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 bg-background p-5">
      <button className="mt-4 flex flex-col items-center gap-2" onClick={() => { const n = taps + 1; setTaps(n); if (n >= 3) { setTaps(0); setAdmin(true); } }}>
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><BookOpen className="h-8 w-8" /></span>
        <span className="text-2xl font-bold">সহজ হিসাব খাতা</span>
        <span className="text-sm text-muted-foreground">আপনার দোকানের নির্ভরযোগ্য হিসাবের খাতা</span>
      </button>
      <div className="rounded-2xl border bg-card p-4 text-center">
        <Lock className="mx-auto h-6 w-6 text-primary" />
        <h1 className="mt-1 text-lg font-bold">অ্যাপটি সক্রিয় করুন</h1>
        <p className="mt-1 text-sm text-muted-foreground">অ্যাপটি ব্যবহার করতে যোগাযোগ করুন। একবার সক্রিয় করলে আজীবন অফলাইনে ব্যবহার করতে পারবেন — আর কখনো কোড লাগবে না।</p>
        <div className="mt-3 rounded-xl bg-muted p-3">
          <div className="text-xs text-muted-foreground">আপনার ডিভাইস কোড</div>
          <div className="text-2xl font-bold tracking-wider">{code}</div>
          <button className="mt-1 inline-flex items-center gap-1 text-sm text-primary" onClick={() => copy(code)}><Copy className="h-4 w-4" /> কোড কপি করুন</button>
        </div>
      </div>
      <a href={wa} target="_blank" rel="noreferrer" className="btn flex items-center justify-center gap-2 bg-success text-primary-foreground"><MessageCircle className="h-5 w-5" /> WhatsApp-এ বার্তা পাঠান</a>
      <a href={`tel:${OWNER_PHONE}`} className="btn flex items-center justify-center gap-2 border bg-card"><Phone className="h-5 w-5" /> কল করুন ({OWNER_PHONE})</a>
      <div className="rounded-2xl border bg-card p-4">
        <label className="text-sm font-medium">সক্রিয়করণ কোড দিন</label>
        <input className="field mt-1 text-center text-xl tracking-widest" value={input} onChange={(e) => { setInput(e.target.value); setErr(false); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="৬ সংখ্যার কোড" />
        {err && <p className="mt-1 text-sm text-danger">ভুল কোড, আবার চেষ্টা করুন</p>}
        <button className="btn mt-3 w-full bg-primary text-primary-foreground" onClick={submit}>সক্রিয় করুন ও অ্যাপ চালু করুন</button>
      </div>
    </div>
  );
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [pass, setPass] = useState("");
  const [ok, setOk] = useState(false);
  const [dev, setDev] = useState("");
  const [out, setOut] = useState("");
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 bg-background p-5">
      <div className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-6 w-6 text-primary" /> মালিকের এডমিন প্যানেল</div>
      {!ok ? (
        <>
          <input className="field" type="password" placeholder="মাস্টার পিন" value={pass} onChange={(e) => setPass(e.target.value)} />
          <button className="btn bg-primary text-primary-foreground" onClick={async () => (await isMaster(pass)) ? setOk(true) : toast.error("ভুল পিন")}>প্রবেশ করুন</button>
        </>
      ) : (
        <>
          <input className="field" placeholder="গ্রাহকের ডিভাইস কোড (যেমন SHK-8419)" value={dev} onChange={(e) => { setDev(e.target.value); setOut(""); }} />
          <button className="btn bg-primary text-primary-foreground" onClick={async () => dev.replace(/\D/g, "") ? setOut(await unlockCodeFor(dev)) : toast.error("ডিভাইস কোড দিন")}>কোড তৈরি করুন</button>
          {out && (
            <div className="rounded-2xl border bg-card p-4 text-center">
              <div className="text-sm text-muted-foreground">আনলক কোড</div>
              <div className="text-3xl font-bold tracking-widest text-success">{out}</div>
              <button className="mt-2 inline-flex items-center gap-1 text-sm text-primary" onClick={() => copy(out)}><Copy className="h-4 w-4" /> কপি করুন</button>
            </div>
          )}
        </>
      )}
      <button className="btn border bg-card" onClick={onClose}>ফিরে যান</button>
    </div>
  );
}
