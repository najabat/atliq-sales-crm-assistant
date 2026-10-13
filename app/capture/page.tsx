import { loadConfig } from "@/lib/config";
import { loadScreenData } from "@/lib/screen_data";
import CaptureView from "../_components/CaptureView";
import SavedBrief from "../_components/SavedBrief";

export const dynamic = "force-static";

// Quick capture. Built and switched off in this build (D23). The screen sends nothing to a model.
export default function CapturePage() {
  const d = loadScreenData();
  const modes = loadConfig().runtime_modes;
  return (
    <>
      <h1>Quick capture</h1>
      <p className="notice">Turned off in this prototype: no AI model runs on the live site, so a pasted note is checked but not read.</p>
      <p>Paste a note after a call, a chat message or an email. When this is turned on, the assistant matches the account,
        reads the note and checks every quote, and you approve what it finds.</p>
      <CaptureView maxChars={modes.live_max_paste_characters} dailyCap={modes.live_max_documents_per_day} />
      <SavedBrief waiting={d.results.waiting_customers} items={d.items} crm={d.crm} limitDays={d.replyLimitDays}
        runDate={d.results.run.run_id.slice(0, 10)} />
    </>
  );
}
