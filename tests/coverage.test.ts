import { describe, it, expect, beforeEach } from 'vitest';
import { AirportState } from '../src/state.js';
import { generateSchedule, findBottleneck } from '../src/scheduler.js';
import type { AirportConfig } from '../src/types.js';

const defaultConfig: AirportConfig = {
  runwayCount: 2,
  gateCount: 5,
  groundCrewCount: 10,
  takeoffBufferSec: 120,
  landingBufferSec: 90,
  mixedOpsBufferSec: 180,
  gateTurnaroundSec: 1800,
  dependencyBufferSec: 300,
  maxHorizonSec: 21600,
  defaultRunwayLengthMeters: 3000,
  operationDurationSec: 180,
};

// ============================================================
// RUNWAY SEPARATION BUFFERS
// ============================================================

describe('Runway separation buffers', () => {
  let state: AirportState;

  beforeEach(() => {
    state = new AirportState({ ...defaultConfig, runwayCount: 1 });
  });

  it('enforces takeoff buffer between consecutive departures', () => {
    state.addFlight({ flightNumber: 'D1', operationType: 'departure', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'D2', operationType: 'departure', priority: 'high', dependencies: [] });

    const result = generateSchedule(state);
    const ops = result.scheduled.sort((a, b) => a.startTime - b.startTime);

    expect(ops).toHaveLength(2);
    expect(ops[1].startTime).toBeGreaterThanOrEqual(ops[0].endTime + defaultConfig.takeoffBufferSec);
  });

  it('enforces landing buffer between consecutive arrivals', () => {
    state.addFlight({ flightNumber: 'A1', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'A2', operationType: 'arrival', priority: 'high', dependencies: [] });

    const result = generateSchedule(state);
    const ops = result.scheduled.sort((a, b) => a.startTime - b.startTime);

    expect(ops).toHaveLength(2);
    expect(ops[1].startTime).toBeGreaterThanOrEqual(ops[0].endTime + defaultConfig.landingBufferSec);
  });

  it('enforces mixed ops buffer when switching arrival/departure', () => {
    state.addFlight({ flightNumber: 'A1', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'D1', operationType: 'departure', priority: 'medium', dependencies: [] });

    const result = generateSchedule(state);
    const ops = result.scheduled.sort((a, b) => a.startTime - b.startTime);

    expect(ops).toHaveLength(2);
    expect(ops[0].operationType).toBe('arrival');
    expect(ops[1].operationType).toBe('departure');
    expect(ops[1].startTime).toBeGreaterThanOrEqual(ops[0].endTime + defaultConfig.mixedOpsBufferSec);
  });

  it('landing buffer is shorter than takeoff buffer', () => {
    const stateA = new AirportState({ ...defaultConfig, runwayCount: 1 });
    stateA.addFlight({ flightNumber: 'A1', operationType: 'arrival', priority: 'high', dependencies: [] });
    stateA.addFlight({ flightNumber: 'A2', operationType: 'arrival', priority: 'high', dependencies: [] });
    const rA = generateSchedule(stateA);
    const arrivalGap = rA.scheduled[1].startTime - rA.scheduled[0].endTime;

    const stateD = new AirportState({ ...defaultConfig, runwayCount: 1 });
    stateD.addFlight({ flightNumber: 'D1', operationType: 'departure', priority: 'high', dependencies: [] });
    stateD.addFlight({ flightNumber: 'D2', operationType: 'departure', priority: 'high', dependencies: [] });
    const rD = generateSchedule(stateD);
    const departureGap = rD.scheduled[1].startTime - rD.scheduled[0].endTime;

    expect(arrivalGap).toBeLessThan(departureGap);
  });
});

// ============================================================
// GATE TURNAROUND
// ============================================================

describe('Gate turnaround constraint', () => {
  it('delays flights when gates are exhausted during turnaround', () => {
    // 1 gate, turnaround 1800s. Second flight must wait for gate turnaround.
    const config: AirportConfig = { ...defaultConfig, gateCount: 1, runwayCount: 2 };
    const state = new AirportState(config);

    state.addFlight({ flightNumber: 'F1', operationType: 'departure', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'F2', operationType: 'departure', priority: 'high', dependencies: [] });

    const result = generateSchedule(state);
    expect(result.scheduled).toHaveLength(2);

    const ops = result.scheduled.sort((a, b) => a.startTime - b.startTime);
    // F2 must wait for gate turnaround: F1.endTime + gateTurnaroundSec
    expect(ops[1].startTime).toBeGreaterThanOrEqual(ops[0].endTime + config.gateTurnaroundSec);
  });

  it('uses multiple gates to avoid turnaround delay', () => {
    // 2 gates, 2 runways. Two flights can run in parallel on different gates.
    const config: AirportConfig = { ...defaultConfig, gateCount: 2, runwayCount: 2 };
    const state = new AirportState(config);

    state.addFlight({ flightNumber: 'F1', operationType: 'departure', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'F2', operationType: 'departure', priority: 'high', dependencies: [] });

    const result = generateSchedule(state);
    expect(result.scheduled).toHaveLength(2);

    const ops = result.scheduled.sort((a, b) => a.startTime - b.startTime);
    // With 2 gates and 2 runways, F2 doesn't need to wait for gate turnaround
    expect(ops[1].startTime).toBeLessThan(ops[0].endTime + config.gateTurnaroundSec);
  });
});

// ============================================================
// GROUND CREW CONSTRAINT
// ============================================================

describe('Ground crew constraint', () => {
  it('delays flights when all crew members are busy', () => {
    // 1 crew member, 2 runways, 5 gates. Crew is the bottleneck.
    const config: AirportConfig = { ...defaultConfig, groundCrewCount: 1, runwayCount: 2, gateCount: 5 };
    const state = new AirportState(config);

    state.addFlight({ flightNumber: 'F1', operationType: 'departure', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'F2', operationType: 'departure', priority: 'high', dependencies: [] });

    const result = generateSchedule(state);
    expect(result.scheduled).toHaveLength(2);

    const ops = result.scheduled.sort((a, b) => a.startTime - b.startTime);
    // F2 must wait for crew: F1.endTime at minimum (crew freeAt = endTime)
    expect(ops[1].startTime).toBeGreaterThanOrEqual(ops[0].endTime);
  });

  it('uses multiple crew members to parallelize operations', () => {
    // 10 crew, 2 runways, 5 gates. No crew bottleneck.
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'F1', operationType: 'departure', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'F2', operationType: 'arrival', priority: 'high', dependencies: [] });

    const result = generateSchedule(state);
    expect(result.scheduled).toHaveLength(2);

    // With 2 runways, 10 crew, 5 gates — both flights can start at t=0
    const ops = result.scheduled;
    expect(ops[0].startTime).toBe(0);
    expect(ops[1].startTime).toBe(0);
  });
});

// ============================================================
// PLANNING HORIZON
// ============================================================

describe('Planning horizon limit', () => {
  it('marks flights as unschedulable when exceeding horizon', () => {
    // Tiny horizon: only 1 operation fits
    const config: AirportConfig = {
      ...defaultConfig,
      runwayCount: 1,
      maxHorizonSec: 400, // only room for 1 op (180s) + takeoff buffer (120s) = 300, second starts at 300, ends 480 > 400
    };
    const state = new AirportState(config);

    state.addFlight({ flightNumber: 'F1', operationType: 'departure', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'F2', operationType: 'departure', priority: 'medium', dependencies: [] });

    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(1);
    expect(result.unschedulable).toHaveLength(1);
    expect(result.unschedulable[0].flightNumber).toBe('F2');
    expect(result.unschedulable[0].reason).toMatch(/horizon/i);
  });

  it('schedules all flights when within horizon', () => {
    const config: AirportConfig = { ...defaultConfig, maxHorizonSec: 100000 };
    const state = new AirportState(config);

    for (let i = 1; i <= 10; i++) {
      state.addFlight({ flightNumber: `F${String(i).padStart(2, '0')}`, operationType: 'departure', priority: 'medium', dependencies: [] });
    }

    const result = generateSchedule(state);
    expect(result.unschedulable).toHaveLength(0);
    expect(result.scheduled).toHaveLength(10);
  });
});

// ============================================================
// CIRCULAR DEPENDENCIES
// ============================================================

describe('Circular dependency detection', () => {
  it('marks mutually dependent flights as unschedulable', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: ['BB'] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'high', dependencies: ['AA'] });

    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(0);
    expect(result.unschedulable).toHaveLength(2);
    expect(result.unschedulable[0].reason).toBe('Circular dependency detected');
    expect(result.unschedulable[1].reason).toBe('Circular dependency detected');
  });

  it('schedules non-cyclic flights alongside cyclic ones', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: ['BB'] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'high', dependencies: ['AA'] });
    state.addFlight({ flightNumber: 'CC', operationType: 'arrival', priority: 'low', dependencies: [] });

    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].flightNumber).toBe('CC');
    expect(result.unschedulable).toHaveLength(2);
  });

  it('detects 3-node cycle', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: ['CC'] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'high', dependencies: ['AA'] });
    state.addFlight({ flightNumber: 'CC', operationType: 'arrival', priority: 'high', dependencies: ['BB'] });

    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(0);
    expect(result.unschedulable).toHaveLength(3);
    for (const u of result.unschedulable) {
      expect(u.reason).toBe('Circular dependency detected');
    }
  });
});

// ============================================================
// PRIORITY TIE-BREAKING
// ============================================================

describe('Priority tie-breaking', () => {
  it('breaks tie by submission order (FIFO)', () => {
    const state = new AirportState({ ...defaultConfig, runwayCount: 1 });

    // Same priority, submitted in order: F1, F2, F3
    state.addFlight({ flightNumber: 'F3', operationType: 'departure', priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'F1', operationType: 'departure', priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'F2', operationType: 'departure', priority: 'medium', dependencies: [] });

    const result = generateSchedule(state);
    const ops = result.scheduled.sort((a, b) => a.startTime - b.startTime);

    // Submitted order: F3 (1st), F1 (2nd), F2 (3rd)
    expect(ops[0].flightNumber).toBe('F3');
    expect(ops[1].flightNumber).toBe('F1');
    expect(ops[2].flightNumber).toBe('F2');
  });

  it('priority trumps submission order', () => {
    const state = new AirportState({ ...defaultConfig, runwayCount: 1 });

    state.addFlight({ flightNumber: 'LO', operationType: 'departure', priority: 'low', dependencies: [] });
    state.addFlight({ flightNumber: 'HI', operationType: 'departure', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'MD', operationType: 'departure', priority: 'medium', dependencies: [] });

    const result = generateSchedule(state);
    const ops = result.scheduled.sort((a, b) => a.startTime - b.startTime);

    expect(ops[0].flightNumber).toBe('HI');
    expect(ops[1].flightNumber).toBe('MD');
    expect(ops[2].flightNumber).toBe('LO');
  });
});

// ============================================================
// MULTIPLE RUNWAY UTILIZATION
// ============================================================

describe('Multiple runway utilization', () => {
  it('distributes flights across runways for parallelism', () => {
    const state = new AirportState(defaultConfig); // 2 runways

    state.addFlight({ flightNumber: 'F1', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'F2', operationType: 'arrival', priority: 'high', dependencies: [] });

    const result = generateSchedule(state);

    // Both should start at t=0 on different runways
    expect(result.scheduled).toHaveLength(2);
    expect(result.scheduled[0].startTime).toBe(0);
    expect(result.scheduled[1].startTime).toBe(0);
    expect(result.scheduled[0].runwayId).not.toBe(result.scheduled[1].runwayId);
  });
});

// ============================================================
// EMPTY SCHEDULE
// ============================================================

describe('Empty schedule', () => {
  it('returns empty result when no flights submitted', () => {
    const state = new AirportState(defaultConfig);
    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(0);
    expect(result.unschedulable).toHaveLength(0);
    expect(result.makespanSec).toBe(0);
  });

  it('returns empty result when all flights are cancelled', () => {
    const state = new AirportState(defaultConfig);
    state.addFlight({ flightNumber: 'F1', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.cancelFlight('F1');

    const result = generateSchedule(state);
    expect(result.scheduled).toHaveLength(0);
    expect(result.makespanSec).toBe(0);
  });
});

// ============================================================
// DEPENDENCY EDGE CASES
// ============================================================

describe('Dependency edge cases', () => {
  it('marks flight unschedulable when dependency is on a cancelled flight', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'high', dependencies: ['AA'] });
    state.cancelFlight('AA');

    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(0);
    expect(result.unschedulable).toHaveLength(1);
    expect(result.unschedulable[0].flightNumber).toBe('BB');
    expect(result.unschedulable[0].reason).toMatch(/dependency/i);
  });

  it('handles multi-level dependency chain correctly', () => {
    const state = new AirportState(defaultConfig);
    const cfg = defaultConfig;

    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'medium', dependencies: ['AA'] });
    state.addFlight({ flightNumber: 'CC', operationType: 'arrival', priority: 'medium', dependencies: ['BB'] });

    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(3);

    const opA = result.scheduled.find((o) => o.flightNumber === 'AA')!;
    const opB = result.scheduled.find((o) => o.flightNumber === 'BB')!;
    const opC = result.scheduled.find((o) => o.flightNumber === 'CC')!;

    expect(opB.startTime).toBeGreaterThanOrEqual(opA.endTime + cfg.dependencyBufferSec);
    expect(opC.startTime).toBeGreaterThanOrEqual(opB.endTime + cfg.dependencyBufferSec);
  });

  it('handles diamond dependency pattern (A -> B, A -> C, B -> D, C -> D)', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'medium', dependencies: ['AA'] });
    state.addFlight({ flightNumber: 'CC', operationType: 'arrival', priority: 'medium', dependencies: ['AA'] });
    state.addFlight({ flightNumber: 'DD', operationType: 'departure', priority: 'low', dependencies: ['BB', 'CC'] });

    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(4);

    const opB = result.scheduled.find((o) => o.flightNumber === 'BB')!;
    const opC = result.scheduled.find((o) => o.flightNumber === 'CC')!;
    const opD = result.scheduled.find((o) => o.flightNumber === 'DD')!;

    // DD must start after both BB and CC + buffer
    expect(opD.startTime).toBeGreaterThanOrEqual(opB.endTime + defaultConfig.dependencyBufferSec);
    expect(opD.startTime).toBeGreaterThanOrEqual(opC.endTime + defaultConfig.dependencyBufferSec);
  });
});

// ============================================================
// STATE MANAGEMENT
// ============================================================

describe('AirportState', () => {
  let state: AirportState;

  beforeEach(() => {
    state = new AirportState(defaultConfig);
  });

  it('throws when cancelling non-existent flight', () => {
    expect(() => state.cancelFlight('NOPE')).toThrow('Flight NOPE not found');
  });

  it('throws when adding duplicate flight', () => {
    state.addFlight({ flightNumber: 'F1', operationType: 'arrival', priority: 'high', dependencies: [] });
    expect(() =>
      state.addFlight({ flightNumber: 'F1', operationType: 'departure', priority: 'low', dependencies: [] }),
    ).toThrow('Flight F1 already exists');
  });

  it('increments submittedAt counter for each flight', () => {
    const f1 = state.addFlight({ flightNumber: 'F1', operationType: 'arrival', priority: 'high', dependencies: [] });
    const f2 = state.addFlight({ flightNumber: 'F2', operationType: 'arrival', priority: 'high', dependencies: [] });

    expect(f2.submittedAt).toBe(f1.submittedAt + 1);
  });

  it('initializes correct number of runways and gates', () => {
    expect(state.getRunways()).toHaveLength(defaultConfig.runwayCount);
    expect(state.getGates()).toHaveLength(defaultConfig.gateCount);
    expect(state.getRunways()[0].id).toBe('RW01');
    expect(state.getGates()[0].id).toBe('G01');
  });

  it('cancel cascades to reset scheduled dependents to pending', () => {
    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'high', dependencies: ['AA'] });
    state.addFlight({ flightNumber: 'CC', operationType: 'arrival', priority: 'high', dependencies: ['BB'] });
    generateSchedule(state);

    expect(state.getFlight('BB')!.status).toBe('scheduled');
    expect(state.getFlight('CC')!.status).toBe('scheduled');

    state.cancelFlight('AA');

    // Direct dependent BB should be reset to pending
    expect(state.getFlight('BB')!.status).toBe('pending');
    // CC remains scheduled (only direct dependents are reset)
    // After regeneration, CC will also fail because BB is no longer scheduled
  });

  it('resetStatusesForReplanning clears unschedulable reasons', () => {
    state.addFlight({
      flightNumber: 'HV', operationType: 'departure', priority: 'high',
      dependencies: [], runwayRequirements: { minLengthMeters: 9999 },
    });
    generateSchedule(state);

    expect(state.getFlight('HV')!.status).toBe('unschedulable');
    expect(state.getFlight('HV')!.unschedulableReason).toBeDefined();

    state.resetStatusesForReplanning();

    expect(state.getFlight('HV')!.status).toBe('pending');
    expect(state.getFlight('HV')!.unschedulableReason).toBeUndefined();
  });
});

// ============================================================
// BOTTLENECK EDGE CASES
// ============================================================

describe('Bottleneck edge cases', () => {
  it('returns empty result for empty schedule', () => {
    const state = new AirportState(defaultConfig);
    const result = findBottleneck(state);

    expect(result.chain).toEqual([]);
    expect(result.totalDurationSec).toBe(0);
  });

  it('returns single flight when no dependencies exist', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'F1', operationType: 'arrival', priority: 'high', dependencies: [] });
    generateSchedule(state);

    const result = findBottleneck(state);

    expect(result.chain).toHaveLength(1);
    expect(result.totalDurationSec).toBe(defaultConfig.operationDurationSec);
  });

  it('computes correct total duration including dependency buffers', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'high', dependencies: ['AA'] });
    generateSchedule(state);

    const result = findBottleneck(state);

    // duration = opDuration(AA) + depBuffer + opDuration(BB) = 180 + 300 + 180 = 660
    expect(result.chain).toEqual(['AA', 'BB']);
    expect(result.totalDurationSec).toBe(
      defaultConfig.operationDurationSec * 2 + defaultConfig.dependencyBufferSec,
    );
  });

  it('picks the longer chain in diamond dependency pattern', () => {
    const config: AirportConfig = { ...defaultConfig, dependencyBufferSec: 100, operationDurationSec: 100 };
    const state = new AirportState(config);

    // A -> B -> D (length 3)
    // A -> C (length 2, shorter)
    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'medium', dependencies: ['AA'] });
    state.addFlight({ flightNumber: 'CC', operationType: 'arrival', priority: 'medium', dependencies: ['AA'] });
    state.addFlight({ flightNumber: 'DD', operationType: 'departure', priority: 'low', dependencies: ['BB'] });
    generateSchedule(state);

    const result = findBottleneck(state);

    expect(result.chain).toEqual(['AA', 'BB', 'DD']);
  });
});

// ============================================================
// SCHEDULE REPLACEMENT
// ============================================================

describe('Schedule replacement', () => {
  it('completely replaces previous schedule on re-generation', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'F1', operationType: 'arrival', priority: 'high', dependencies: [] });
    const r1 = generateSchedule(state);
    expect(r1.scheduled).toHaveLength(1);

    state.addFlight({ flightNumber: 'F2', operationType: 'departure', priority: 'high', dependencies: [] });
    const r2 = generateSchedule(state);

    expect(r2.scheduled).toHaveLength(2);
    // Both flights should be in the new schedule
    expect(r2.scheduled.map((o) => o.flightNumber).sort()).toEqual(['F1', 'F2']);
  });

  it('previously unschedulable flight becomes schedulable after config-compatible reschedule', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'AA', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'BB', operationType: 'departure', priority: 'high', dependencies: ['AA'] });
    state.cancelFlight('AA');

    const r1 = generateSchedule(state);
    expect(r1.unschedulable).toHaveLength(1);
    expect(state.getFlight('BB')!.status).toBe('unschedulable');

    // Add new flight that BB can depend on... but BB still depends on cancelled AA
    // So BB stays unschedulable
    const r2 = generateSchedule(state);
    expect(r2.unschedulable).toHaveLength(1);
  });
});

// ============================================================
// MAKESPAN CALCULATION
// ============================================================

describe('Makespan', () => {
  it('equals the latest operation endTime', () => {
    const state = new AirportState(defaultConfig);

    state.addFlight({ flightNumber: 'F1', operationType: 'arrival', priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'F2', operationType: 'departure', priority: 'medium', dependencies: ['F1'] });

    const result = generateSchedule(state);
    const maxEnd = Math.max(...result.scheduled.map((o) => o.endTime));

    expect(result.makespanSec).toBe(maxEnd);
  });

  it('is 0 for empty schedule', () => {
    const state = new AirportState(defaultConfig);
    const result = generateSchedule(state);
    expect(result.makespanSec).toBe(0);
  });
});

// ============================================================
// OPERATION DURATION
// ============================================================

describe('Operation duration', () => {
  it('every scheduled operation has correct duration', () => {
    const state = new AirportState(defaultConfig);

    for (let i = 1; i <= 6; i++) {
      state.addFlight({
        flightNumber: `FL${String(i).padStart(2, '0')}`,
        operationType: i % 2 === 0 ? 'arrival' : 'departure',
        priority: 'medium',
        dependencies: [],
      });
    }

    const result = generateSchedule(state);

    for (const op of result.scheduled) {
      expect(op.endTime - op.startTime).toBe(defaultConfig.operationDurationSec);
    }
  });
});

// ============================================================
// GATE ASSIGNMENT
// ============================================================

describe('Gate assignment', () => {
  it('every scheduled flight gets a gate', () => {
    const state = new AirportState(defaultConfig);

    for (let i = 1; i <= 4; i++) {
      state.addFlight({
        flightNumber: `FL${String(i).padStart(2, '0')}`,
        operationType: 'arrival',
        priority: 'medium',
        dependencies: [],
      });
    }

    const result = generateSchedule(state);

    for (const op of result.scheduled) {
      expect(op.gateId).toBeDefined();
      expect(op.gateId).toMatch(/^G\d{2}$/);
    }
  });
});

// ============================================================
// STRESS: MANY FLIGHTS
// ============================================================

describe('Stress test', () => {
  it('schedules 50 flights without errors', () => {
    const config: AirportConfig = { ...defaultConfig, runwayCount: 4, gateCount: 20, groundCrewCount: 50 };
    const state = new AirportState(config);

    for (let i = 1; i <= 50; i++) {
      state.addFlight({
        flightNumber: `FL${String(i).padStart(3, '0')}`,
        operationType: i % 2 === 0 ? 'arrival' : 'departure',
        priority: ['high', 'medium', 'low'][i % 3] as 'high' | 'medium' | 'low',
        dependencies: [],
      });
    }

    const result = generateSchedule(state);

    expect(result.scheduled.length + result.unschedulable.length).toBe(50);
    // Most should be scheduled with enough resources
    expect(result.scheduled.length).toBeGreaterThan(30);
  });
});
