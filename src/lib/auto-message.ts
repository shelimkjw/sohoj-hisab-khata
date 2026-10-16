import { useEffect, useState } from "react";
import { TX_LABEL, bnDay, customerBalance, getDB, taka, type Tx } from "@/lib/ledger";
import { getRecovery } from "@/lib/cloud-backup";

const KEY = "shk_auto_wa_cust";
const LEGACY = "shk_auto_wa";
const EVT = "shk-auto-wa";

const bnDigits = (s: string) => s.replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯".charAt(Number(d)));

function readMap(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Per-customer auto-message setting. Falls back to the old global switch for existing users. */
export const getAutoMsg = (customerId: string) => {
  if (typeof localStorage === "undefined") return false;
  const m = readMap();
  return customerId in m ? m[customerId]! : localStorage.getItem(LEGACY) === "1";
};
export const setAutoMsg = (customerId: string, on: boolean) => {
  localStorage.setItem(KEY, JSON.stringify({ ...readMap(), [customerId]: on }));
  window.dispatchEvent(new Event(EVT));
};
export function useAutoMsg(customerId: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const u = () => setOn(getAutoMsg(customerId));
    u();
    window.addEventListener(EVT, u);
    return () => window.removeEventListener(EVT, u);
  }, [customerId]);
  return on;
}

/** Bangladeshi number → WhatsApp digits (8801XXXXXXXXX). Returns "" if invalid. */
export function waNumber(phone: string) {
  let d = phone.replace(/[০-৯]/g, (c) => String("০১২৩৪৫৬৭৮৯".indexOf(c))).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("01") && d.length === 11) d = "88" + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
}

const TX_HEAD: Record<Tx["type"], string> = {
  credit: "🔴 *ধরন: বাকি দিলাম (আপনি নিলেন)*",
  received: "🟢 *ধরন: টাকা পেলাম (আপনি জমা দিলেন)*",
  owed: "🔴 *ধরন: আপনার পাওনা যোগ হলো*",
  paid: "🟢 *ধরন: টাকা দিলাম*",
  income: "🟢 *ধরন: আয়*",
  expense: "🔴 *ধরন: খরচ*",
};

export function sendTxMessage(customerId: string, tx: Pick<Tx, "type" | "amount" | "description" | "date">) {
  const db = getDB();
  const c = db.customers.find((x) => x.id === customerId);
  const num = c ? waNumber(c.phone) : "";
  if (!c || !num) return false;
  const bal = customerBalance(db, customerId);
  const shop = db.settings.shopName || "সহজ হিসাব খাতা";
  const rec = getRecovery();
  const contact = rec?.phone ? `📞 যোগাযোগ / WhatsApp: ${bnDigits(rec.phone)}` : "";
  const balLine =
    bal > 0 ? `🔴 *আপনার মোট বাকি: ${taka(bal)}*` : bal < 0 ? `🟢 *আপনার পাওনা আমার কাছে: ${taka(-bal)}*` : "✅ *হিসাব পরিশোধিত*";
  const text = [
    `🏪 *${shop}*`,
    `তারিখ: ${bnDay(tx.date)}`,
    ``,
    `প্রিয় ${c.name},`,
    `আপনার হিসাবে নতুন লেনদেন যোগ হয়েছে:`,
    `━━━━━━━━━━━━`,
    TX_HEAD[tx.type] ?? `ধরন: ${TX_LABEL[tx.type]}`,
    `*পরিমাণ: ${taka(tx.amount)}*`,
    ...(tx.description ? [`বিবরণ: ${tx.description}`] : []),
    `━━━━━━━━━━━━`,
    balLine,
    ``,
    ...(contact ? [contact, ``] : []),
    `ধন্যবাদ — ${shop}`,
  ].join("\n");
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank");
  return true;
}
