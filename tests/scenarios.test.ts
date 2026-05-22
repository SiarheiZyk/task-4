import { describe, it, expect, beforeEach } from 'vitest';
import { AirportState } from '../src/state.js';
import { generateSchedule } from '../src/scheduler.js';
import type { AirportConfig } from '../src/types.js';

const config: AirportConfig = {
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

describe('Scenario 1: Morning Rush', () => {
  it('расписывает 4 рейса смешанных типов с приоритетами', () => {
    const state = new AirportState(config);
    state.addFlight({
      flightNumber: 'F1',
      operationType: 'arrival',
      priority: 'high',
      dependencies: [],
    });
    state.addFlight({
      flightNumber: 'F2',
      operationType: 'departure',
      priority: 'medium',
      dependencies: [],
    });
    state.addFlight({
      flightNumber: 'F3',
      operationType: 'arrival',
      priority: 'low',
      dependencies: [],
    });
    state.addFlight({
      flightNumber: 'F4',
      operationType: 'departure',
      priority: 'low',
      dependencies: [],
    });

    const result = generateSchedule(state);
    expect(result.scheduled).toHaveLength(4);
    expect(result.unschedulable).toHaveLength(0);
  });
});

describe('Scenario 2: Heavy Hauler', () => {
  it('блокирует рейс при отсутствии подходящей ВПП', () => {
    const state = new AirportState(config);
    state.addFlight({
      flightNumber: 'HV1',
      operationType: 'departure',
      priority: 'high',
      dependencies: [],
      runwayRequirements: { minLengthMeters: 5000 },
    });
    state.addFlight({
      flightNumber: 'NM1',
      operationType: 'arrival',
      priority: 'medium',
      dependencies: [],
    });

    const result = generateSchedule(state);
    expect(result.unschedulable.find((u) => u.flightNumber === 'HV1')).toBeDefined();
    expect(result.scheduled.find((op) => op.flightNumber === 'NM1')).toBeDefined();
  });
});

describe('Scenario 3: Connecting Flight', () => {
  it('outbound не начинается раньше окончания inbound + буфер', () => {
    const state = new AirportState(config);
    state.addFlight({
      flightNumber: 'INBOUND',
      operationType: 'arrival',
      priority: 'medium',
      dependencies: [],
    });
    state.addFlight({
      flightNumber: 'OUTBOUND',
      operationType: 'departure',
      priority: 'medium',
      dependencies: ['INBOUND'],
    });

    const result = generateSchedule(state);
    const inOp = result.scheduled.find((op) => op.flightNumber === 'INBOUND')!;
    const outOp = result.scheduled.find((op) => op.flightNumber === 'OUTBOUND')!;

    expect(outOp.startTime).toBeGreaterThanOrEqual(inOp.endTime + config.dependencyBufferSec);
  });
});
