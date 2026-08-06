const test = require('node:test');
const assert = require('node:assert/strict');
const sim = require('../www/sim-records.js');

test('legacy and detailed actual landing fields are not double counted', () => {
  assert.equal(sim.actualLandingCount({ ldgPf: 'PF', dayLdg: 1, nightLdg: 0 }), 1);
  assert.equal(sim.actualLandingCount({ ldgPf: 'PM', dayLdg: 0, nightLdg: 0 }), 0);
  assert.equal(sim.actualLandingCount({ landings: 1 }), 1);
  assert.equal(sim.actualLandingCount({}), 1);
  assert.equal(sim.actualLandingCount({ landings: 0 }), 0);
});

test('SIM landings and time are summarized separately', () => {
  const summary = sim.summarize([
    { recordType: 'FLIGHT', ldgPf: 'PF' },
    { recordType: 'SIM', role: 'SIM', total: '2:30', simDayLandings: 3, simNightLandings: 2, simApproved: true },
    { role: 'SIM', total: '1:00', simDayLandings: 1, simNightLandings: 0, simApproved: false },
  ]);
  assert.deepEqual(summary, {
    actualLandings: 1,
    simLandings: 6,
    combinedLandings: 7,
    simMinutes: 210,
    approvedSimLandings: 5,
  });
});

test('SIM input requires duration and non-negative integer counts', () => {
  assert.equal(sim.validateInput({ date: '2026-08-06', total: '1:30', simTakeoffs: 1, simDayLandings: 2, simNightLandings: 0 }), '');
  assert.match(sim.validateInput({ date: '2026-08-06', total: '', simTakeoffs: 0, simDayLandings: 0, simNightLandings: 0 }), /훈련시간/);
  assert.match(sim.validateInput({ date: '2026-08-06', total: '1:00', simTakeoffs: -1, simDayLandings: 0, simNightLandings: 0 }), /0 이상의 정수/);
});
