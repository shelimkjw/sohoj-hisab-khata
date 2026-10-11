import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  // Android back button closes the sheet
  const active = useRef(false);
  useEffect(() => {
    if (!open) return;
    active.current = true;
    if (!history.state?.sheet) history.pushState({ sheet: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      active.current = false;
      setTimeout(() => {
        if (!active.current && history.state?.sheet) history.back();
      }, 0);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-4 pb-8 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="বন্ধ" className="rounded-full p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 mt-3 block text-sm font-medium text-muted-foreground">{children}</label>;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const t = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold ${t}`}>{value}</div>
    </div>
  );
}
