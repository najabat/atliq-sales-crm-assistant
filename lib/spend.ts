// Spend control around lib/spend_guard.mjs (D24). Before every model call, retries included,
// the most that call can cost is reserved. A call that would take the run past the kill switch is not sent.
// It also stops before the running total across all runs passes the amount at which Najabat is asked.
import { reserveBeforeDispatch } from "./spend_guard.mjs";

export interface Prices {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface Reservation {
  id: number;
  boundUsd: number;
}

export class SpendStop extends Error {
  reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.reason = reason;
  }
}

export class SpendTracker {
  private accrued = 0; // this run, from the token counts the vendor reports
  private outstanding = new Map<number, number>();
  private nextId = 1;

  private prices: Prices;
  private killSwitchUsd: number;
  private priorTotalUsd: number; // every earlier run, from the run logs
  private askAtUsd: number;

  constructor(prices: Prices, killSwitchUsd: number, priorTotalUsd: number, askAtUsd: number) {
    this.prices = prices;
    this.killSwitchUsd = killSwitchUsd;
    this.priorTotalUsd = priorTotalUsd;
    this.askAtUsd = askAtUsd;
  }

  get runUsd(): number { return this.accrued; }
  get totalUsd(): number { return this.priorTotalUsd + this.accrued; }
  get reservedUsd(): number { return [...this.outstanding.values()].reduce((a, b) => a + b, 0); }

  // Synchronous on purpose, so two calls started together cannot both pass on the same remaining budget.
  reserve(maxInputTokens: number, maxOutputTokens: number): Reservation {
    const r = reserveBeforeDispatch({
      accruedUsd: this.accrued,
      outstandingReservedUsd: this.reservedUsd,
      stopBudgetUsd: this.killSwitchUsd,
      maxInputTokens,
      maxOutputTokens,
      inputUsdPerMillion: this.prices.inputUsdPerMillion,
      outputUsdPerMillion: this.prices.outputUsdPerMillion,
      attempts: 1,
    });
    if (!r.allowed) throw new SpendStop(r.reason, `Spend guard stopped the call: ${r.reason}.`);
    const bound = r.boundUsd as number;
    if (this.priorTotalUsd + this.accrued + this.reservedUsd + bound > this.askAtUsd) {
      throw new SpendStop("ASK_NAJABAT", `The running total would pass ${this.askAtUsd} USD. Stopped to ask first.`);
    }
    const id = this.nextId++;
    this.outstanding.set(id, bound);
    return { id, boundUsd: bound };
  }

  costOf(inputTokens: number, outputTokens: number): number {
    return (inputTokens * this.prices.inputUsdPerMillion + outputTokens * this.prices.outputUsdPerMillion) / 1_000_000;
  }

  // Replace the reservation with what the call really cost. A failed call that reports no usage costs nothing.
  settle(res: Reservation, inputTokens = 0, outputTokens = 0): number {
    this.outstanding.delete(res.id);
    const cost = this.costOf(inputTokens, outputTokens);
    this.accrued += cost;
    return cost;
  }
}
