import { z } from 'zod';
import type { AirportConfig } from './types.js';

const EnvSchema = z.object({
  RUNWAY_COUNT: z.coerce.number().int().min(1).max(20).default(2),
  GATE_COUNT: z.coerce.number().int().min(1).max(200).default(10),
  GROUND_CREW_COUNT: z.coerce.number().int().min(1).max(500).default(20),

  TAKEOFF_BUFFER_SEC: z.coerce.number().int().min(30).default(120),
  LANDING_BUFFER_SEC: z.coerce.number().int().min(30).default(90),
  MIXED_OPS_BUFFER_SEC: z.coerce.number().int().min(30).default(180),

  GATE_TURNAROUND_SEC: z.coerce.number().int().min(300).default(2700), // 45 min
  DEPENDENCY_BUFFER_SEC: z.coerce.number().int().min(0).default(600), // 10 min

  MAX_HORIZON_SEC: z.coerce.number().int().min(3600).default(21600), // 6 hours

  DEFAULT_RUNWAY_LENGTH_M: z.coerce.number().int().min(1000).default(3000),
  OPERATION_DURATION_SEC: z.coerce.number().int().min(30).default(180), // 3 min on runway
});

export function loadConfig(): AirportConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[atc-mcp] Invalid ENV configuration:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  const env = parsed.data;
  return {
    runwayCount: env.RUNWAY_COUNT,
    gateCount: env.GATE_COUNT,
    groundCrewCount: env.GROUND_CREW_COUNT,
    takeoffBufferSec: env.TAKEOFF_BUFFER_SEC,
    landingBufferSec: env.LANDING_BUFFER_SEC,
    mixedOpsBufferSec: env.MIXED_OPS_BUFFER_SEC,
    gateTurnaroundSec: env.GATE_TURNAROUND_SEC,
    dependencyBufferSec: env.DEPENDENCY_BUFFER_SEC,
    maxHorizonSec: env.MAX_HORIZON_SEC,
    defaultRunwayLengthMeters: env.DEFAULT_RUNWAY_LENGTH_M,
    operationDurationSec: env.OPERATION_DURATION_SEC,
  };
}
