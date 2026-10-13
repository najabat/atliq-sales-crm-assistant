import {reserveBeforeDispatch} from '../lib/spend_guard.mjs';
const base={accruedUsd:0,stopBudgetUsd:4,maxInputTokens:2000,maxOutputTokens:1000,inputUsdPerMillion:1.5,outputUsdPerMillion:7.5,attempts:2,margin:1.25};
const test=(name,run,want)=>{const v=reserveBeforeDispatch(run);if(v.allowed!==want)throw new Error(`${name}: ${JSON.stringify(v)}`);console.log(`PASS ${name} => ${v.allowed?'reserve':'stop'}`);};
test('bounded normal call',base,true);
test('near cap rejects call',{...base,accruedUsd:3.99},false);
test('unpriced call fails closed',{...base,inputUsdPerMillion:undefined},false);
test('concurrent reservations consume budget',{...base,accruedUsd:3.98,outstandingReservedUsd:0.01},false);
test('unbounded output fails closed',{...base,maxOutputTokens:NaN},false);
