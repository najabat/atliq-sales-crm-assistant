import { loadScreenData } from "@/lib/screen_data";
import CrmView from "../_components/CrmView";

export const dynamic = "force-static";

// CRM changes to approve. What should change in the CRM and why.
export default function CrmPage() {
  const d = loadScreenData();
  return (
    <>
      <h1>CRM changes to approve</h1>
      <CrmView changes={d.results.crm_changes} flags={d.results.crm_flags} items={d.results.items} crm={d.crm}
        docs={d.docs} sellers={d.sellers} referenceDate={d.referenceDate} />
    </>
  );
}
