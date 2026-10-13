"use client";
import { setName } from "@/lib/prefs";
import { useWork } from "@/lib/useWork";

// "Working as" is a label for the log. It is not a sign-in.
export default function NamePicker({ sellers }: { sellers: string[] }) {
  const { name } = useWork();
  return (
    <div className="name-picker">
      <label htmlFor="working-as">Working as</label>
      <select id="working-as" value={name ?? ""} aria-describedby="working-as-hint"
        title="A label for the log. Not a sign-in." onChange={(e) => setName(e.target.value || null)}>
        <option value="">Pick your name</option>
        {sellers.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span id="working-as-hint" className="hint">A label for the log, not a sign-in.</span>
    </div>
  );
}
