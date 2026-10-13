// An item as the screens show it. Browser safe.
import type { Item } from "./types.ts";

// `rule_made` marks a card the screens built from a rule at build time, not one the model found.
export type ShownItem = Item & { rule_made?: boolean };

export const RULE_REPLY_SUMMARY = "Reply to their last message";

// Rule-made or found by the model. Nudges are always rule-made.
export const setByRule = (i: ShownItem) => i.type === "nudge_due" || i.rule_made === true;
