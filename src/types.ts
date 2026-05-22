export type OperationType = 'arrival' | 'departure';
export type Priority = 'high' | 'medium' | 'low';
export type FlightStatus = 'pending' | 'scheduled' | 'cancelled' | 'unschedulable';

export interface RunwayRequirements {
  minLengthMeters?: number; // минимальная требуемая длина
}

export interface Flight {
  flightNumber: string;
  operationType: OperationType;
  priority: Priority;
  dependencies: string[]; // номера рейсов, которые должны быть раньше
  runwayRequirements?: RunwayRequirements;
  // Внутренние поля (заполняются сервером):
  status: FlightStatus;
  unschedulableReason?: string;
  submittedAt: number; // порядок поступления для tie-break
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
  startTime: number; // секунды от t=0 (начало планирования)
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
  // Длина "стандартной" полосы (для проверки runway requirements)
  defaultRunwayLengthMeters: number;
  // Длительность операции на полосе
  operationDurationSec: number;
}
