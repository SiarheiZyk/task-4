export type OperationType = 'arrival' | 'departure';
export type Priority = 'high' | 'medium' | 'low';
export type FlightStatus = 'pending' | 'scheduled' | 'cancelled' | 'unschedulable';

export interface RunwayRequirements {
  minLengthMeters?: number;
}

export interface Flight {
  flightNumber: string;
  operationType: OperationType;
  priority: Priority;
  dependencies: string[];
  runwayRequirements?: RunwayRequirements;
  // Internal fields (set by server):
  status: FlightStatus;
  unschedulableReason?: string;
  submittedAt: number;
}

export interface Runway {
  id: string;
  lengthMeters: number;
}

export interface Gate {
  id: string;
}

export interface ScheduledOperation {
  flightNumber: string;
  operationType: OperationType;
  runwayId: string;
  gateId?: string;
  startTime: number;
  endTime: number;
}

export interface AirportConfig {
  runwayCount: number;
  gateCount: number;
  groundCrewCount: number;
  takeoffBufferSec: number;
  landingBufferSec: number;
  mixedOpsBufferSec: number;
  gateTurnaroundSec: number;
  dependencyBufferSec: number;
  maxHorizonSec: number;
  defaultRunwayLengthMeters: number;
  operationDurationSec: number;
}
