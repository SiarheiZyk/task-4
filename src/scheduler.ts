import type { Flight, ScheduledOperation, AirportConfig, OperationType } from './types.js';
import type { AirportState } from './state.js';

interface RunwayUsage {
  runwayId: string;
  lengthMeters: number;
  lastEndTime: number;
  lastOpType: OperationType | null;
}

interface GateUsage {
  gateId: string;
  freeAt: number;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export interface ScheduleResult {
  scheduled: ScheduledOperation[];
  unschedulable: Array<{ flightNumber: string; reason: string }>;
  makespanSec: number;
}

export function generateSchedule(state: AirportState): ScheduleResult {
  const config = state.getConfig();
  const allFlights = state.getFlights().filter((f) => f.status !== 'cancelled');

  // Сбрасываем состояния перед перепланированием
  state.resetStatusesForReplanning();

  // 1) Топологическая сортировка с tie-break
  const sortedFlights = topologicalSortWithPriority(allFlights);

  // 2) Инициализация ресурсов
  const runways: RunwayUsage[] = state.getRunways().map((r) => ({
    runwayId: r.id,
    lengthMeters: r.lengthMeters,
    lastEndTime: 0,
    lastOpType: null,
  }));
  const gates: GateUsage[] = state.getGates().map((g) => ({
    gateId: g.id,
    freeAt: 0,
  }));

  const scheduled: ScheduledOperation[] = [];
  const unschedulable: Array<{ flightNumber: string; reason: string }> = [];
  const scheduledByNum = new Map<string, ScheduledOperation>();

  // 3) Жадное размещение каждого рейса
  for (const flight of sortedFlights) {
    // Проверка: достаточная длина полосы?
    const requiredLen = flight.runwayRequirements?.minLengthMeters ?? 0;
    const suitableRunways = runways.filter((r) => r.lengthMeters >= requiredLen);
    if (suitableRunways.length === 0) {
      const reason = `No runway available with length >= ${requiredLen}m`;
      unschedulable.push({ flightNumber: flight.flightNumber, reason });
      state.markUnschedulable(flight.flightNumber, reason);
      continue;
    }

    // Ранний старт: после всех зависимостей + буфер
    let earliestStart = 0;
    let depMissing = false;
    for (const depNum of flight.dependencies) {
      const depOp = scheduledByNum.get(depNum);
      if (!depOp) {
        depMissing = true;
        break;
      }
      earliestStart = Math.max(earliestStart, depOp.endTime + config.dependencyBufferSec);
    }
    if (depMissing) {
      const reason = `Dependency unscheduled`;
      unschedulable.push({ flightNumber: flight.flightNumber, reason });
      state.markUnschedulable(flight.flightNumber, reason);
      continue;
    }

    // Найти лучший слот среди подходящих полос
    let best: ScheduledOperation | null = null;
    let bestRunway: RunwayUsage | null = null;
    let bestGate: GateUsage | null = null;

    for (const rw of suitableRunways) {
      const sep = getRequiredSeparation(rw.lastOpType, flight.operationType, config);
      let startTime = Math.max(earliestStart, rw.lastEndTime + sep);

      // Назначаем гейт: ранний свободный
      const gateCandidates = [...gates].sort(
        (a, b) => a.freeAt - b.freeAt || a.gateId.localeCompare(b.gateId),
      );
      const gate = gateCandidates[0];
      if (!gate) continue;
      startTime = Math.max(startTime, gate.freeAt);

      // Проверка горизонта планирования
      if (startTime + config.operationDurationSec > config.maxHorizonSec) continue;

      const op: ScheduledOperation = {
        flightNumber: flight.flightNumber,
        operationType: flight.operationType,
        runwayId: rw.runwayId,
        gateId: gate.gateId,
        startTime,
        endTime: startTime + config.operationDurationSec,
      };

      if (
        !best ||
        op.startTime < best.startTime ||
        (op.startTime === best.startTime && op.runwayId.localeCompare(best.runwayId) < 0)
      ) {
        best = op;
        bestRunway = rw;
        bestGate = gate;
      }
    }

    if (!best || !bestRunway || !bestGate) {
      const reason = `No feasible slot within horizon`;
      unschedulable.push({ flightNumber: flight.flightNumber, reason });
      state.markUnschedulable(flight.flightNumber, reason);
      continue;
    }

    // Резервируем ресурсы
    bestRunway.lastEndTime = best.endTime;
    bestRunway.lastOpType = flight.operationType;
    bestGate.freeAt = best.endTime + config.gateTurnaroundSec;

    scheduled.push(best);
    scheduledByNum.set(flight.flightNumber, best);
  }

  // 4) Сохраняем результат в state
  state.setSchedule(scheduled);

  const makespanSec = scheduled.length ? Math.max(...scheduled.map((op) => op.endTime)) : 0;

  return { scheduled, unschedulable, makespanSec };
}

function topologicalSortWithPriority(flights: Flight[]): Flight[] {
  const byNum = new Map(flights.map((f) => [f.flightNumber, f]));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const f of flights) {
    indeg.set(f.flightNumber, 0);
    adj.set(f.flightNumber, []);
  }
  for (const f of flights) {
    for (const dep of f.dependencies) {
      if (!byNum.has(dep)) continue; // зависимость от отменённого/несуществующего
      adj.get(dep)!.push(f.flightNumber);
      indeg.set(f.flightNumber, (indeg.get(f.flightNumber) ?? 0) + 1);
    }
  }

  const ready: Flight[] = flights.filter((f) => indeg.get(f.flightNumber) === 0);
  sortByPriority(ready);

  const result: Flight[] = [];
  while (ready.length) {
    const f = ready.shift()!;
    result.push(f);
    for (const next of adj.get(f.flightNumber) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) {
        ready.push(byNum.get(next)!);
        sortByPriority(ready);
      }
    }
  }
  return result;
}

function sortByPriority(arr: Flight[]) {
  arr.sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    if (a.submittedAt !== b.submittedAt) return a.submittedAt - b.submittedAt;
    return a.flightNumber.localeCompare(b.flightNumber);
  });
}

function getRequiredSeparation(
  prevType: OperationType | null,
  currType: OperationType,
  config: AirportConfig,
): number {
  if (prevType === null) return 0;
  if (prevType === currType) {
    return currType === 'departure' ? config.takeoffBufferSec : config.landingBufferSec;
  }
  return config.mixedOpsBufferSec;
}

// === BOTTLENECK ANALYSIS (Critical Path) ===
export interface BottleneckResult {
  chain: string[];
  totalDurationSec: number;
}

export function findBottleneck(state: AirportState): BottleneckResult {
  const schedule = state.getLastSchedule();
  if (schedule.length === 0) return { chain: [], totalDurationSec: 0 };

  const scheduledNums = new Set(schedule.map((op) => op.flightNumber));
  const flights = state.getFlights().filter((f) => scheduledNums.has(f.flightNumber));
  const byNum = new Map(flights.map((f) => [f.flightNumber, f]));
  const opByNum = new Map(schedule.map((op) => [op.flightNumber, op]));

  // Динамика: для каждого рейса находим самую длинную цепочку, заканчивающуюся на нём
  const memo = new Map<string, { length: number; chain: string[] }>();

  function dfs(num: string): { length: number; chain: string[] } {
    if (memo.has(num)) return memo.get(num)!;
    const flight = byNum.get(num)!;
    const op = opByNum.get(num)!;
    let bestChain: string[] = [];
    let bestLen = 0;

    for (const dep of flight.dependencies) {
      if (!opByNum.has(dep)) continue;
      const sub = dfs(dep);
      if (sub.length > bestLen) {
        bestLen = sub.length;
        bestChain = sub.chain;
      }
    }

    const duration = op.endTime - op.startTime;
    const result = {
      length:
        bestLen + duration + (bestChain.length > 0 ? state.getConfig().dependencyBufferSec : 0),
      chain: [...bestChain, num],
    };
    memo.set(num, result);
    return result;
  }

  let overall = { length: 0, chain: [] as string[] };
  for (const f of flights) {
    const r = dfs(f.flightNumber);
    if (r.length > overall.length) overall = r;
  }

  return { chain: overall.chain, totalDurationSec: overall.length };
}
