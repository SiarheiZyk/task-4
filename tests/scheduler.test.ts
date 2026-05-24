// tests/scheduler.test.ts
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

describe('Scheduler', () => {
  let state: AirportState;

  beforeEach(() => {
    state = new AirportState(defaultConfig);
  });

  it('schedules a simple mixed operations queue', () => {
    state.addFlight({ flightNumber: 'SU100', operationType: 'arrival',
      priority: 'high', dependencies: [] });
    state.addFlight({ flightNumber: 'SU200', operationType: 'departure',
      priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'SU300', operationType: 'arrival',
      priority: 'low', dependencies: [] });
    state.addFlight({ flightNumber: 'SU400', operationType: 'departure',
      priority: 'low', dependencies: [] });

    const result = generateSchedule(state);

    expect(result.scheduled).toHaveLength(4);
    expect(result.unschedulable).toHaveLength(0);
    // High priority should be scheduled first
    const firstOp = result.scheduled
      .reduce((a, b) => a.startTime <= b.startTime ? a : b);
    expect(firstOp.flightNumber).toBe('SU100');
  });

  it('does not overlap operations on the same runway', () => {
    for (let i = 1; i <= 5; i++) {
      state.addFlight({
        flightNumber: `SU${i}00`, operationType: 'departure',
        priority: 'medium', dependencies: [],
      });
    }
    const result = generateSchedule(state);
    const byRunway = new Map<string, typeof result.scheduled>();
    for (const op of result.scheduled) {
      const arr = byRunway.get(op.runwayId) ?? [];
      arr.push(op);
      byRunway.set(op.runwayId, arr);
    }
    for (const ops of byRunway.values()) {
      ops.sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < ops.length; i++) {
        expect(ops[i].startTime).toBeGreaterThanOrEqual(ops[i - 1].endTime);
      }
    }
  });

  it('rejects flight requiring longer runway than available', () => {
    state.addFlight({
      flightNumber: 'AC777', operationType: 'departure', priority: 'high',
      dependencies: [], runwayRequirements: { minLengthMeters: 5000 },
    });
    const result = generateSchedule(state);
    expect(result.scheduled).toHaveLength(0);
    expect(result.unschedulable).toHaveLength(1);
    expect(result.unschedulable[0].reason).toMatch(/length/i);
  });

  it('respects flight dependencies', () => {
    state.addFlight({ flightNumber: 'IN100', operationType: 'arrival',
      priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'OUT200', operationType: 'departure',
      priority: 'medium', dependencies: ['IN100'] });

    const result = generateSchedule(state);
    const inOp = result.scheduled.find((op) => op.flightNumber === 'IN100')!;
    const outOp = result.scheduled.find((op) => op.flightNumber === 'OUT200')!;

    expect(outOp.startTime).toBeGreaterThanOrEqual(
      inOp.endTime + defaultConfig.dependencyBufferSec,
    );
  });

  it('is deterministic: repeated calls produce identical results', () => {
    state.addFlight({ flightNumber: 'A1', operationType: 'arrival',
      priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'B2', operationType: 'departure',
      priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'C3', operationType: 'arrival',
      priority: 'high', dependencies: [] });

    const r1 = generateSchedule(state);
    const r2 = generateSchedule(state);
    expect(JSON.stringify(r1.scheduled)).toBe(JSON.stringify(r2.scheduled));
  });

  it('cancellation removes flight from schedule', () => {
    state.addFlight({ flightNumber: 'X1', operationType: 'departure',
      priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'X2', operationType: 'departure',
      priority: 'medium', dependencies: ['X1'] });
    generateSchedule(state);
    state.cancelFlight('X1');
    const result = generateSchedule(state);

    expect(result.scheduled.find((op) => op.flightNumber === 'X1')).toBeUndefined();
    expect(state.getFlight('X1')?.status).toBe('cancelled');
    // X2 cannot be scheduled now (its dependency was cancelled)
    expect(state.getFlight('X2')?.status).toBe('unschedulable');
  });

  it('bottleneck finds the longest dependency chain', () => {
    state.addFlight({ flightNumber: 'A', operationType: 'arrival',
      priority: 'medium', dependencies: [] });
    state.addFlight({ flightNumber: 'B', operationType: 'departure',
      priority: 'medium', dependencies: ['A'] });
    state.addFlight({ flightNumber: 'C', operationType: 'arrival',
      priority: 'medium', dependencies: ['B'] });
    state.addFlight({ flightNumber: 'D', operationType: 'departure',
      priority: 'medium', dependencies: [] }); // independent

    generateSchedule(state);
    const result = findBottleneck(state);
    expect(result.chain).toEqual(['A', 'B', 'C']);
    expect(result.totalDurationSec).toBeGreaterThan(0);
  });
});