import { formatUsd } from "@/lib/format";
import { loadScreenData } from "@/lib/screen_data";
import OwedList from "../_components/OwedList";

export const dynamic = "force-static";

// The Owed list. Everything AtliQ owes, in order.
export default function OwedPage() {
  const d = loadScreenData();
  return (
    <>
      <h1>Owed list</h1>
      <OwedList items={d.items} docs={d.docs} people={d.people} nudgeDays={d.nudgeDays}
        rowNames={Object.fromEntries(d.crm.map((r) => [r.lead_id, r.company]))}
        rowValues={Object.fromEntries(d.crm.filter((r) => r.est_value_usd && r.status !== "Won" && r.status !== "Lost").map((r) => [r.lead_id, formatUsd(Number(r.est_value_usd))]))}
        referenceDate={d.referenceDate} />
    </>
  );
}
