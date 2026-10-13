/**
 * Conservative pre-call spending gate. This does not charge, call a model, or
 * guarantee vendor billing; integrate with the model adapter and actual atomic
 * persisted budget reservations before enabling paid/concurrent workloads.
 *
 * All amounts USD. maxInputTokens includes full prompt/context and provider
 * overhead budget; maxOutputTokens includes thinking and visible output.
 * Set attempts to 2 if one retry is permitted and cannot be ruled out.
 */
export function reserveBeforeDispatch({ accruedUsd, outstandingReservedUsd = 0,
  stopBudgetUsd = 4, maxInputTokens, maxOutputTokens, inputUsdPerMillion,
  outputUsdPerMillion, attempts = 1, margin = 1.25 }) {
  const values=[accruedUsd,outstandingReservedUsd,stopBudgetUsd,maxInputTokens,
   maxOutputTokens,inputUsdPerMillion,outputUsdPerMillion,attempts,margin];
  if(values.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0)||
     !Number.isInteger(attempts)||attempts<1||margin<1||stopBudgetUsd===0) {
    return {allowed:false,reason:'MISSING_OR_INVALID_COST_BOUND'};
  }
  const boundUsd = attempts * margin * (
    maxInputTokens * inputUsdPerMillion / 1_000_000 +
    maxOutputTokens * outputUsdPerMillion / 1_000_000);
  if(accruedUsd + outstandingReservedUsd + boundUsd > stopBudgetUsd) {
    return { allowed:false, reason:'RUN_SPEND_BUDGET_EXCEEDED', boundUsd,
      remainingUsd:Math.max(0,stopBudgetUsd-accruedUsd-outstandingReservedUsd) };
  }
  return {allowed:true,reason:'RESERVE_ATOMICALLY_BEFORE_CALL',boundUsd,
    remainingUsd:stopBudgetUsd-accruedUsd-outstandingReservedUsd-boundUsd};
}
