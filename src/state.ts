import type {
  Flight,
  Runway,
  Gate,
  ScheduledOperation,
  AirportConfig,
  FlightStatus,
} from './types.js';

export class AirportState {
  private flights = new Map<string, Flight>();
  private runways: Runway[] = [];
  private gates: Gate[] = [];
  private lastSchedule: ScheduledOperation[] = [];
  private submissionCounter = 0;

  constructor(private readonly config: AirportConfig) {
    // Инициализация полос
    for (let i = 1; i <= config.runwayCount; i++) {
      this.runways.push({
        id: `RW${String(i).padStart(2, '0')}`,
        lengthMeters: config.defaultRunwayLengthMeters,
      });
    }
    // Инициализация гейтов
    for (let i = 1; i <= config.gateCount; i++) {
      this.gates.push({ id: `G${String(i).padStart(2, '0')}` });
    }
  }

  getConfig() {
    return this.config;
  }
  getRunways(): Runway[] {
    return [...this.runways];
  }
  getGates(): Gate[] {
    return [...this.gates];
  }
  getFlights(): Flight[] {
    return [...this.flights.values()];
  }
  getFlight(num: string): Flight | undefined {
    return this.flights.get(num);
  }
  getLastSchedule(): ScheduledOperation[] {
    return [...this.lastSchedule];
  }

  addFlight(input: Omit<Flight, 'status' | 'submittedAt'>): Flight {
    if (this.flights.has(input.flightNumber)) {
      throw new Error(`Flight ${input.flightNumber} already exists`);
    }
    const flight: Flight = {
      ...input,
      status: 'pending',
      submittedAt: ++this.submissionCounter,
    };
    this.flights.set(flight.flightNumber, flight);
    return flight;
  }

  cancelFlight(num: string): Flight {
    const f = this.flights.get(num);
    if (!f) throw new Error(`Flight ${num} not found`);
    f.status = 'cancelled';
    // Удаляем из расписания
    this.lastSchedule = this.lastSchedule.filter((op) => op.flightNumber !== num);
    // Зависимые рейсы возвращаем в pending
    for (const other of this.flights.values()) {
      if (other.dependencies.includes(num) && other.status === 'scheduled') {
        other.status = 'pending';
      }
    }
    return f;
  }

  setSchedule(schedule: ScheduledOperation[]) {
    this.lastSchedule = schedule;
    // Обновляем статусы рейсов
    const scheduledNums = new Set(schedule.map((op) => op.flightNumber));
    for (const f of this.flights.values()) {
      if (f.status === 'cancelled') continue;
      if (scheduledNums.has(f.flightNumber)) {
        f.status = 'scheduled';
        f.unschedulableReason = undefined;
      }
    }
  }

  markUnschedulable(num: string, reason: string) {
    const f = this.flights.get(num);
    if (!f) return;
    f.status = 'unschedulable';
    f.unschedulableReason = reason;
  }

  resetStatusesForReplanning() {
    for (const f of this.flights.values()) {
      if (f.status !== 'cancelled') {
        f.status = 'pending';
        f.unschedulableReason = undefined;
      }
    }
    this.lastSchedule = [];
  }
}
