import { useState } from "react";
import { toast } from "sonner";
import {
  CUSTOMER_TYPES, TX_LABEL, activeCustomers, customerBalance, deleteTx, isLikelyDuplicate, saveCustomer, saveTx, taka, useDB,
  type Customer, type Tx, type TxType,
} from "@/lib/ledger";
import { Label, Sheet } from "./ui";

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function CustomerForm({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer?: Customer; onSaved?: (id: string) => void }) {
  const [f, setF] = useState(() => ({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
    opening: customer ? String(Math.abs(customer.openingBalance) || "") : "",
    openingDir: (customer?.openingBalance ?? 0) < 0 ? "payable" : "receivable",
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    if (!f.name.trim()) return void toast.error("নাম লিখুন");
    if (f.phone && !/^[0-9+\-\s০-৯]{6,15}$/.test(f.phone)) return void toast.error("ফোন নম্বর সঠিক নয়");
    const amt = Number(f.opening || 0);
    if (!(amt >= 0) || !isFinite(amt)) return void toast.error("শুরুর ব্যালেন্স সঠিক নয়");
    try {
      const id = saveCustomer({
        id: customer?.id,
        name: f.name.trim(),
        phone: f.phone.trim(),
        address: f.address.trim(),
        notes: f.notes.trim(),
        openingBalance: f.openingDir === "payable" ? -amt : amt,
      });
      toast.success("সংরক্ষিত হয়েছে");
      onSaved?.(id);
      onClose();
    } catch {
      toast.error("সংরক্ষণ ব্যর্থ — ফোনের জায়গা পরীক্ষা করুন");
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={customer ? "গ্রাহক সম্পাদনা" : "নতুন গ্রাহক"}>
      <Label>নাম *</Label>
      <input className="field" value={f.name} onChange={set("name")} autoFocus />
      <Label>ফোন নম্বর</Label>
      <input className="field" inputMode="tel" value={f.phone} onChange={set("phone")} />
      <Label>ঠিকানা</Label>
      <input className="field" value={f.address} onChange={set("address")} />
      <Label>শুরুর ব্যালেন্স (৳)</Label>
      <div className="flex gap-2">
        <input className="field" inputMode="decimal" value={f.opening} onChange={set("opening")} placeholder="০" />
        <select className="field max-w-40" value={f.openingDir} onChange={set("openingDir")}>
          <option value="receivable">আমি পাবো</option>
          <option value="payable">সে পাবে</option>
        </select>
      </div>
      <Label>নোট</Label>
      <textarea className="field" rows={2} value={f.notes} onChange={set("notes")} />
      <button className="btn mt-5 w-full bg-primary text-primary-foreground" onClick={submit}>সংরক্ষণ করুন</button>
    </Sheet>
  );
}

export function TxForm({ open, onClose, tx, presetType, presetCustomer }: { open: boolean; onClose: () => void; tx?: Tx; presetType?: TxType; presetCustomer?: string }) {
  const db = useDB();
  const customers = activeCustomers(db).sort((a, b) => a.name.localeCompare(b.name, "bn"));
  const [type, setType] = useState<TxType>(tx?.type ?? presetType ?? "credit");
  const [customerId, setCustomerId] = useState(tx?.customerId ?? presetCustomer ?? "");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [date, setDate] = useState(toLocalInput(tx?.date ?? Date.now()));
  const [description, setDescription] = useState(tx?.description ?? "");
  const [reference, setReference] = useState(tx?.reference ?? "");
  const [busy, setBusy] = useState(false);
  const needsCustomer = CUSTOMER_TYPES.includes(type);
  const amt = Number(amount.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))));

  const submit = () => {
    if (busy) return;
    if (!(amt > 0) || !isFinite(amt)) return void toast.error("সঠিক টাকার পরিমাণ দিন");
    if (amt > 1e10) return void toast.error("পরিমাণ অনেক বড়");
    if (needsCustomer && !customerId) return void toast.error("গ্রাহক নির্বাচন করুন");
    const cid = needsCustomer ? customerId : undefined;
    if (!tx && isLikelyDuplicate({ customerId: cid, type, amount: amt }) && !confirm("একই লেনদেন এইমাত্র যোগ হয়েছে। আবার যোগ করবেন?")) return;
    setBusy(true);
    try {
      saveTx({ id: tx?.id, type, customerId: cid, amount: amt, date: new Date(date).getTime() || Date.now(), description: description.trim(), reference: reference.trim() });
      toast.success("লেনদেন সংরক্ষিত");
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "সংরক্ষণ ব্যর্থ");
    } finally {
      setBusy(false);
    }
  };

  const types: TxType[] = ["credit", "received", "owed", "paid", "income", "expense"];
  const tone = (t: TxType) => (t === "received" || t === "income" || t === "owed" ? "success" : "danger");
  return (
    <Sheet open={open} onClose={onClose} title={tx ? "লেনদেন সংশোধন" : "নতুন লেনদেন"}>
      <div className="grid grid-cols-3 gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`btn px-2 text-sm border ${type === t ? (tone(t) === "success" ? "bg-success text-primary-foreground border-success" : "bg-danger text-primary-foreground border-danger") : "bg-card"}`}
          >
            {TX_LABEL[t]}
          </button>
        ))}
      </div>
      {needsCustomer && (
        <>
          <Label>গ্রাহক *</Label>
          <select className="field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— নির্বাচন করুন —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` (${c.phone})` : ""} · {taka(customerBalance(db, c.id))}
              </option>
            ))}
          </select>
        </>
      )}
      <Label>টাকার পরিমাণ (৳) *</Label>
      <input className="field text-2xl font-bold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="০" />
      <Label>তারিখ ও সময়</Label>
      <input type="datetime-local" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
      <Label>বিবরণ</Label>
      <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="যেমন: চাল ১০ কেজি" />
      <Label>রেফারেন্স নম্বর</Label>
      <input className="field" value={reference} onChange={(e) => setReference(e.target.value)} />
      <button className="btn mt-5 w-full bg-primary text-primary-foreground" disabled={busy} onClick={submit}>সংরক্ষণ করুন</button>
      {tx && (
        <button
          className="btn mt-2 w-full border text-danger"
          onClick={() => {
            if (!confirm("এই লেনদেনটি মুছে ফেলবেন? ব্যালেন্স আবার হিসাব হবে।")) return;
            deleteTx(tx.id);
            toast.success("মুছে ফেলা হয়েছে");
            onClose();
          }}
        >
          লেনদেন মুছুন
        </button>
      )}
    </Sheet>
  );
}
