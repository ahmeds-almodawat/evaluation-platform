#!/usr/bin/env node
/**
 * Evaluation volume estimator for campaign safety planning.
 * It does not connect to Supabase; use it to model large departments before creating campaigns.
 *
 * Examples:
 *   npm run stress:estimate -- --stations=10 --employees-per-station=20 --cap=5
 *   npm run stress:estimate -- --departments=2 --source=200 --target=120 --cap=5
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, Number(value ?? 1)];
  }),
);

const stations = Number.isFinite(args.stations) ? args.stations : 10;
const employeesPerStation = Number.isFinite(args['employees-per-station']) ? args['employees-per-station'] : 20;
const cap = Number.isFinite(args.cap) ? args.cap : 5;
const source = Number.isFinite(args.source) ? args.source : stations * employeesPerStation;
const target = Number.isFinite(args.target) ? args.target : stations * employeesPerStation;

const selfStationUncappedPerStation = employeesPerStation * Math.max(employeesPerStation - 1, 0);
const selfStationCappedPerStation = employeesPerStation * Math.min(cap, Math.max(employeesPerStation - 1, 0));
const allStationsSelfUncapped = stations * selfStationUncappedPerStation;
const allStationsSelfCapped = stations * selfStationCappedPerStation;
const oneCrossStationUncapped = employeesPerStation * employeesPerStation;
const oneCrossStationCapped = employeesPerStation * Math.min(cap, employeesPerStation);
const allToAllCrossStationUncapped = stations * Math.max(stations - 1, 0) * oneCrossStationUncapped;
const allToAllCrossStationCapped = stations * Math.max(stations - 1, 0) * oneCrossStationCapped;
const crossDepartmentUncapped = source * target;
const crossDepartmentCapped = source * Math.min(cap, target);

const rows = [
  ['Self station, one station, uncapped', selfStationUncappedPerStation],
  ['Self station, one station, capped', selfStationCappedPerStation],
  ['Self station, all stations, uncapped', allStationsSelfUncapped],
  ['Self station, all stations, capped', allStationsSelfCapped],
  ['Cross station, one source→target, uncapped', oneCrossStationUncapped],
  ['Cross station, one source→target, capped', oneCrossStationCapped],
  ['Cross station, all stations→all stations, uncapped', allToAllCrossStationUncapped],
  ['Cross station, all stations→all stations, capped', allToAllCrossStationCapped],
  ['Cross department, source→target, uncapped', crossDepartmentUncapped],
  ['Cross department, source→target, capped', crossDepartmentCapped],
];

console.log('\nEvaluation volume estimate');
console.log('='.repeat(32));
console.log(`stations: ${stations}`);
console.log(`employees per station: ${employeesPerStation}`);
console.log(`source employees: ${source}`);
console.log(`target employees: ${target}`);
console.log(`cap per evaluator: ${cap}`);
console.log('');

const labelWidth = Math.max(...rows.map(([label]) => label.length));
for (const [label, value] of rows) {
  const marker = value >= 5000 ? '  ⚠️ large' : '';
  console.log(`${label.padEnd(labelWidth)} : ${String(value).padStart(8)}${marker}`);
}
console.log('');
console.log('Recommendation: keep peer/cross flows capped. Manager→Team and Team→Manager can remain all-assigned because their scopes are naturally smaller.');
