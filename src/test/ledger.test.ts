import { beforeEach, describe, expect, it } from "vitest";
import {
  customerBalance, customerLedger, deleteTx, exportBackup, getDB, parseBackup, restoreBackup, saveCustomer, saveTx,
} from "@/lib/ledger";

const add = (customerId: string, type: "credit" | "received", amount: number) =>
  saveTx({ customerId, type, amount, date: Date.now(), description: "", reference: "" });

describe("ledger arithmetic", () => {
  beforeEach(() => localStorage.clear());

  it("runs the mandatory credit/payment scenario", () => {
    const id = saveCustomer({ name: "রহিম", phone: "", address: "", notes: "", openingBalance: 0 });
    add(id, "credit", 1000);
    expect(customerBalance(getDB(), id)).toBe(1000);
    add(id, "received", 300);
    expect(customerBalance(getDB(), id)).toBe(700);
    add(id, "credit", 200);
    expect(customerBalance(getDB(), id)).toBe(900);

    const rows = customerLedger(getDB(), id);
    deleteTx(rows[1].tx.id); // reverse the ৳300 payment
    expect(customerBalance(getDB(), id)).toBe(1200);

    const before = getDB().txs.length;
    const backup = parseBackup(exportBackup());
    restoreBackup(backup, "merge");
    restoreBackup(backup, "merge");
    expect(getDB().txs.length).toBe(before);
    expect(customerBalance(getDB(), id)).toBe(1200);
  });

  it("rejects invalid amounts", () => {
    const id = saveCustomer({ name: "ক", phone: "", address: "", notes: "", openingBalance: 0 });
    expect(() => add(id, "credit", -5)).toThrow();
    expect(() => add(id, "credit", 0)).toThrow();
  });
});
