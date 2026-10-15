import { useEffect, useState } from "react";
import { TX_LABEL, bnDay, customerBalance, getDB, taka, type Tx } from "@/lib/ledger";

const KEY = "shk_auto_wa";
const EVT = "shk-auto-wa";

export const getAutoMsg = () => typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
export const setAutoMsg = (on: boolean) => {
  localStorage.setItem(KEY, on ? "1" : "0");
  window.dispatchEvent(new Event(EVT));
};
export function useAutoMsg() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const u = () => setOn(getAutoMsg());
    u();
    window.addEventListener(EVT, u);
    return () => window.removeEventListener(EVT, u);
  }, []);
  return on;
}

/** Bangladeshi number → WhatsApp digits (8801XXXXXXXXX). Returns "" if invalid. */
export function waNumber(phone: string) {
  let d = phone.replace(/[০-৯]/g, (c) => String("০১২৩৪৫৬৭৮৯".indexOf(c))).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("01") && d.length === 11) d = "88" + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
}

export function sendTxMessage(customerId: string, tx: Pick<Tx, "type" | "amount" | "description" | "date">) {
  const db = getDB();
  const c = db.customers.find((x) => x.id === customerId);
  const num = c ? waNumber(c.phone) : "";
  if (!c || !num) return false;
  const bal = customerBalance(db, customerId);
  const shop = db.settings.shopName || "সহজ হিসাব খাতা";
  const text = [
    `🏪 ${shop}`,
    `তারিখ: ${bnDay(tx.date)}`,
    ``,
    `প্রিয় ${c.name},`,
    `আপনার হিসাবে নতুন লেনদেন যোগ হয়েছে:`,
    `━━━━━━━━━━━━`,
    `ধরন: ${TX_LABEL[tx.type]}`,
    `পরিমাণ: ${taka(tx.amount)}`,
    ...(tx.description ? [`বিবরণ: ${tx.description}`] : []),
    `━━━━━━━━━━━━`,
    bal > 0 ? `বর্তমান মোট বাকি: ${taka(bal)}` : bal < 0 ? `আপনার পাওনা: ${taka(-bal)}` : `হিসাব পরিশোধিত ✅`,
    ``,
    `ধন্যবাদ — ${shop}`,
  ].join("\n");
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank");
  return true;
}
