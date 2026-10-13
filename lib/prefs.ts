// The name picked in "Working as". A per-browser convenience and a label for the log, not a sign-in.
const KEY = "atliq-working-as";
export const NAME_EVENT = "atliq-name-changed";

export function getName(): string | null {
  try { return typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null; } catch { return null; }
}

export function setName(name: string | null): void {
  try {
    if (name) window.localStorage.setItem(KEY, name);
    else window.localStorage.removeItem(KEY);
  } catch { /* blocked storage: the choice lasts for this page only */ }
  try { window.dispatchEvent(new Event(NAME_EVENT)); } catch { /* no window */ }
}
