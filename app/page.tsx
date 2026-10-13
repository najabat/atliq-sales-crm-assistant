import { modelName, versionName } from "@/lib/format";
import { loadScreenData } from "@/lib/screen_data";
import BriefView from "./_components/BriefView";

export const dynamic = "force-static";

// The Daily brief. What needs me today. Nothing here calls a model.
export default function DailyBrief() {
  const d = loadScreenData();
  const r = d.results;
  return (
    <>
      <h1>Daily brief</h1>
      <BriefView waiting={r.waiting_customers} items={d.items} gone={r.gone_quiet} changes={r.crm_changes} flags={r.crm_flags} crm={d.crm}
        docs={d.docs} people={d.people} referenceDate={d.referenceDate} limitDays={d.replyLimitDays} nudgeDays={d.nudgeDays} />
      <p className="small run">Results from {modelName(r.run.model)}, version {versionName(r.run.prompt_version)}. Run {r.run.run_id}, model id {r.run.model}, prompt version {r.run.prompt_version}.</p>
    </>
  );
}
