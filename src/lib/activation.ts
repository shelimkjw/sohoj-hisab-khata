// One-time, offline device activation. Once activated it is stored permanently on the device.
const DEV_KEY = "shk-device-code";
const ACT_KEY = "shk-activated";
const MASTER_HASH = "070a1405f9a0777819d3ccc6b477bb0c8dd359d8ee594f1e47642a7eb5a614c9";
export const OWNER_PHONE = "01614498916";

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function deviceCode(): string {
  let c = localStorage.getItem(DEV_KEY);
  if (!c) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 9000 + 1000;
    c = "SHK-" + n;
    localStorage.setItem(DEV_KEY, c);
  }
  return c;
}

export const isActivated = () => localStorage.getItem(ACT_KEY) === "1";

export const isMaster = async (input: string) => (await sha256(input.trim())) === MASTER_HASH;

/** 6-digit unlock code for a device code (e.g. "SHK-8419" or "8419"). */
export async function unlockCodeFor(device: string): Promise<string> {
  const digits = device.replace(/\D/g, "");
  const h = await sha256("shk|" + digits + "|" + MASTER_HASH);
  return String(parseInt(h.slice(0, 8), 16) % 1000000).padStart(6, "0");
}

export async function tryActivate(input: string): Promise<boolean> {
  const v = input.trim();
  const ok = (await isMaster(v)) || v.replace(/\D/g, "") === (await unlockCodeFor(deviceCode()));
  if (ok) localStorage.setItem(ACT_KEY, "1");
  return ok;
}
