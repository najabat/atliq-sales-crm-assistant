"use client";
// Lets a screen re-render when the seller's work or the picked name changes. Reads only through lib/store.ts.
import { useEffect, useState } from "react";
import { getName, NAME_EVENT } from "./prefs.ts";
import { load, STORE_EVENT, type WorkFile } from "./store.ts";

const blank: WorkFile = { app: "atliq-sales-crm-assistant", version: 1, decisions: [], notes: [] };

export function useWork(): { work: WorkFile; name: string | null; ready: boolean } {
  const [work, setWork] = useState<WorkFile>(blank);
  const [name, setNameState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const refresh = () => { setWork(load()); setNameState(getName()); setReady(true); };
    refresh();
    window.addEventListener(STORE_EVENT, refresh);
    window.addEventListener(NAME_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STORE_EVENT, refresh);
      window.removeEventListener(NAME_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return { work, name, ready };
}
