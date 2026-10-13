import { formatUsd, plural } from "@/lib/format";
import type { northStar } from "@/lib/north_star";

// The North Star tile. Shown on the Daily brief and, as the saved brief, on Quick capture.
export default function NorthStarTile({ ns, limitDays, wholeTeamNote = false, id = "north-star" }:
  { ns: ReturnType<typeof northStar>; limitDays: number; wholeTeamNote?: boolean; id?: string }) {
  return (
    <section className="tile" aria-labelledby={id}>
      {wholeTeamNote && <p className="small">Whole team. The Mine switch filters the lists below.</p>}
      <h2 id={id} className="big">{plural(ns.over.length, "customer has", "customers have")} waited more than {limitDays} days for a reply</h2>
      <p>They hold {formatUsd(ns.valueOver)} of the {formatUsd(ns.pipeline)} open pipeline that has a value.</p>
      <p>{ns.counted.length} are waiting in total.</p>
      {ns.settledCount > 0 && <p>{ns.settledCount === 1 ? "1 customer was closed by a seller on this browser and no longer counts."
        : `${ns.settledCount} customers were closed by a seller on this browser and no longer count.`}</p>}
      <p className="small">Counted from email threads and call notes only. Chat apps and phone calls are not read.</p>
    </section>
  );
}
