"use client";
import { formatDate } from "@/lib/format";
import { northStar, waitingRows } from "@/lib/north_star";
import type { CrmRow } from "@/lib/crm_schema";
import type { ShownItem } from "@/lib/shown";
import type { WaitingCustomer } from "@/lib/types";
import { useWork } from "@/lib/useWork";
import NorthStarTile from "./NorthStarTile";

// The saved brief stays on screen whatever happens to a pasted note. Counted exactly as the Daily brief counts it.
export default function SavedBrief({ waiting, items, crm, limitDays, runDate }:
  { waiting: WaitingCustomer[]; items: ShownItem[]; crm: CrmRow[]; limitDays: number; runDate: string }) {
  const { work } = useWork();
  const ns = northStar(waitingRows(waiting, items, crm, work.decisions), crm, limitDays);
  return (
    <section aria-labelledby="saved-h">
      <h2 id="saved-h" className="band-sub">Your saved brief</h2>
      <p className="small">From the run of {formatDate(runDate)}. A pasted note never changes it in this build.</p>
      <NorthStarTile ns={ns} limitDays={limitDays} id="saved-north-star" />
      <p><a className="tap" href="/">Open the Daily brief</a></p>
    </section>
  );
}
