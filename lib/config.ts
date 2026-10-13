// Reads config/assistant.config.json. Every number the product uses comes from here.
import fs from "node:fs";
import path from "node:path";

export interface AppConfig {
  data: { dataset_reference_date: string; dataset_folder: string; test_emails_folder: string };
  follow_up_rules: {
    reply_owed_limit_days: number;
    nudge_after_days_without_reply: number;
    come_back_buffer_days: number;
  };
  team: { sellers: string[]; pre_sales: string[]; email_domain: string };
  runtime_modes: {
    live_processing: boolean;
    live_max_documents_per_day: number;
    live_max_paste_characters: number;
    passcode_wrong_tries_before_lockout: number;
    passcode_lockout_minutes: number;
  };
  [key: string]: unknown;
}

let cached: AppConfig | null = null;

export function loadConfig(root: string = process.cwd()): AppConfig {
  if (!cached) {
    const file = path.join(root, "config", "assistant.config.json");
    cached = JSON.parse(fs.readFileSync(file, "utf8")) as AppConfig;
  }
  return cached;
}
