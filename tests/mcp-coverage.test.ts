import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig } from '../src/config.js';
import { AirportState } from '../src/state.js';
import { registerSubmitFlight } from '../src/tools/submitFlight.js';
import { registerGenerateSchedule } from '../src/tools/generateSchedule.js';
import { registerGetStatus } from '../src/tools/getStatus.js';
import { registerCancelFlight } from '../src/tools/cancelFlight.js';
import { registerBottleneck } from '../src/tools/bottleneck.js';
import { registerFlightQueueResource } from '../src/resources/flightQueue.js';
import { registerRunwaysResource } from '../src/resources/runways.js';
import { registerTimelineResource } from '../src/resources/timeline.js';

type TextContent = Array<{ type: string; text: string }>;

function parseResult(result: { content: unknown }) {
  return JSON.parse((result.content as TextContent)[0].text);
}

async function createClientServer() {
  const config = loadConfig();
  const state = new AirportState(config);
  const server = new McpServer({ name: 'atc-mcp-test', version: '1.0.0' });

  registerSubmitFlight(server, state);
  registerGenerateSchedule(server, state);
  registerGetStatus(server, state);
  registerCancelFlight(server, state);
  registerBottleneck(server, state);
  registerFlightQueueResource(server, state);
  registerRunwaysResource(server, state);
  registerTimelineResource(server, state);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

// Helper to submit a flight via MCP
async function submit(client: Client, args: Record<string, unknown>) {
  return client.callTool({ name: 'submit_flight', arguments: args });
}

// ============================================================
// cancel_flight edge cases
// ============================================================

describe('MCP: cancel_flight edge cases', () => {
  let client: Client;
  beforeEach(async () => { client = await createClientServer(); });

  it('returns error when cancelling non-existent flight', async () => {
    const result = await client.callTool({
      name: 'cancel_flight',
      arguments: { flightNumber: 'NOPE' },
    });
    expect(result.isError).toBe(true);
  });

  it('reports multiple affected dependents', async () => {
    await submit(client, { flightNumber: 'AA', operationType: 'arrival' });
    await submit(client, { flightNumber: 'B1', operationType: 'departure', dependencies: ['AA'] });
    await submit(client, { flightNumber: 'B2', operationType: 'departure', dependencies: ['AA'] });
    await submit(client, { flightNumber: 'B3', operationType: 'arrival', dependencies: ['AA'] });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.callTool({ name: 'cancel_flight', arguments: { flightNumber: 'AA' } });
    const data = parseResult(result);

    expect(data.affectedDependents).toHaveLength(3);
    expect(data.affectedDependents.sort()).toEqual(['B1', 'B2', 'B3']);
  });
});

// ============================================================
// get_airport_status edge cases
// ============================================================

describe('MCP: get_airport_status edge cases', () => {
  let client: Client;
  beforeEach(async () => { client = await createClientServer(); });

  it('returns correct status before any schedule', async () => {
    await submit(client, { flightNumber: 'F1', operationType: 'arrival' });
    await submit(client, { flightNumber: 'F2', operationType: 'departure' });

    const result = await client.callTool({ name: 'get_airport_status', arguments: {} });
    const status = parseResult(result);

    expect(status.flights.total).toBe(2);
    expect(status.flights.pending).toBe(2);
    expect(status.flights.scheduled).toBe(0);
    expect(status.flights.arrivals).toBe(1);
    expect(status.flights.departures).toBe(1);
    expect(status.scheduleCompletionTimeSec).toBeNull();
  });

  it('reports blocked flights with reasons', async () => {
    await submit(client, {
      flightNumber: 'HV', operationType: 'departure', priority: 'high',
      minRunwayLengthMeters: 9999,
    });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.callTool({ name: 'get_airport_status', arguments: {} });
    const status = parseResult(result);

    expect(status.blockedFlights).toHaveLength(1);
    expect(status.blockedFlights[0].flightNumber).toBe('HV');
    expect(status.blockedFlights[0].reason).toMatch(/runway/i);
  });

  it('reports correct counts after cancellation', async () => {
    await submit(client, { flightNumber: 'F1', operationType: 'arrival' });
    await submit(client, { flightNumber: 'F2', operationType: 'departure' });
    await client.callTool({ name: 'generate_schedule', arguments: {} });
    await client.callTool({ name: 'cancel_flight', arguments: { flightNumber: 'F1' } });

    const result = await client.callTool({ name: 'get_airport_status', arguments: {} });
    const status = parseResult(result);

    expect(status.flights.cancelled).toBe(1);
    expect(status.flights.total).toBe(2);
  });
});

// ============================================================
// generate_schedule edge cases
// ============================================================

describe('MCP: generate_schedule edge cases', () => {
  let client: Client;
  beforeEach(async () => { client = await createClientServer(); });

  it('returns empty schedule when no flights exist', async () => {
    const result = await client.callTool({ name: 'generate_schedule', arguments: {} });
    const data = parseResult(result);

    expect(data.scheduled_count).toBe(0);
    expect(data.unschedulable_count).toBe(0);
    expect(data.makespan_sec).toBe(0);
  });

  it('replaces previous schedule completely', async () => {
    await submit(client, { flightNumber: 'F1', operationType: 'arrival' });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    await submit(client, { flightNumber: 'F2', operationType: 'departure' });
    const result = await client.callTool({ name: 'generate_schedule', arguments: {} });
    const data = parseResult(result);

    expect(data.scheduled_count).toBe(2);
  });

  it('marks unschedulable flight with clear reason via MCP', async () => {
    await submit(client, {
      flightNumber: 'BIG1', operationType: 'departure',
      minRunwayLengthMeters: 8000,
    });
    const result = await client.callTool({ name: 'generate_schedule', arguments: {} });
    const data = parseResult(result);

    expect(data.unschedulable_count).toBe(1);
    expect(data.unschedulable[0].reason).toContain('8000');
  });
});

// ============================================================
// analyze_bottleneck edge cases
// ============================================================

describe('MCP: analyze_bottleneck edge cases', () => {
  let client: Client;
  beforeEach(async () => { client = await createClientServer(); });

  it('returns empty chain before any schedule', async () => {
    const result = await client.callTool({ name: 'analyze_bottleneck', arguments: {} });
    const data = parseResult(result);

    expect(data.critical_chain).toEqual([]);
    expect(data.total_duration_sec).toBe(0);
    expect(data.chain_length).toBe(0);
  });

  it('returns single-flight chain when no dependencies', async () => {
    await submit(client, { flightNumber: 'F1', operationType: 'arrival' });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.callTool({ name: 'analyze_bottleneck', arguments: {} });
    const data = parseResult(result);

    expect(data.chain_length).toBe(1);
    expect(data.total_duration_sec).toBeGreaterThan(0);
  });
});

// ============================================================
// Resources after various operations
// ============================================================

describe('MCP: resource content accuracy', () => {
  let client: Client;
  beforeEach(async () => { client = await createClientServer(); });

  it('flight queue shows all status groups correctly', async () => {
    await submit(client, { flightNumber: 'OK', operationType: 'arrival' });
    await submit(client, { flightNumber: 'BIG', operationType: 'departure', minRunwayLengthMeters: 9999 });
    await submit(client, { flightNumber: 'DEL', operationType: 'arrival' });

    await client.callTool({ name: 'generate_schedule', arguments: {} });
    await client.callTool({ name: 'cancel_flight', arguments: { flightNumber: 'DEL' } });

    const result = await client.readResource({ uri: 'atc://flights/queue' });
    const data = JSON.parse((result.contents[0] as { text: string }).text);

    expect(data.scheduled).toHaveLength(1);
    expect(data.scheduled[0].flightNumber).toBe('OK');
    expect(data.unschedulable).toHaveLength(1);
    expect(data.unschedulable[0].flightNumber).toBe('BIG');
    expect(data.cancelled).toHaveLength(1);
    expect(data.cancelled[0].flightNumber).toBe('DEL');
  });

  it('empty resources before any flights', async () => {
    const queue = await client.readResource({ uri: 'atc://flights/queue' });
    const qData = JSON.parse((queue.contents[0] as { text: string }).text);
    expect(qData.pending).toHaveLength(0);
    expect(qData.scheduled).toHaveLength(0);

    const timeline = await client.readResource({ uri: 'atc://timeline' });
    const tData = JSON.parse((timeline.contents[0] as { text: string }).text);
    expect(tData.totalOperations).toBe(0);
    expect(tData.timeline).toHaveLength(0);

    const runways = await client.readResource({ uri: 'atc://runways' });
    const rData = JSON.parse((runways.contents[0] as { text: string }).text);
    expect(rData.length).toBeGreaterThan(0);
    expect(rData[0].operationCount).toBe(0);
  });

  it('runway resource shows operations sorted by startTime', async () => {
    await submit(client, { flightNumber: 'F1', operationType: 'arrival', priority: 'high' });
    await submit(client, { flightNumber: 'F2', operationType: 'departure', priority: 'medium' });
    await submit(client, { flightNumber: 'F3', operationType: 'arrival', priority: 'low' });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.readResource({ uri: 'atc://runways' });
    const data = JSON.parse((result.contents[0] as { text: string }).text);

    for (const rw of data) {
      for (let i = 1; i < rw.operations.length; i++) {
        expect(rw.operations[i].startTime).toBeGreaterThanOrEqual(rw.operations[i - 1].startTime);
      }
    }
  });

  it('unschedulable flights in queue have reason field', async () => {
    await submit(client, {
      flightNumber: 'HUGE', operationType: 'departure', minRunwayLengthMeters: 9999,
    });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.readResource({ uri: 'atc://flights/queue' });
    const data = JSON.parse((result.contents[0] as { text: string }).text);

    expect(data.unschedulable).toHaveLength(1);
    expect(data.unschedulable[0].reason).toBeDefined();
    expect(data.unschedulable[0].reason).toMatch(/runway/i);
  });
});

// ============================================================
// Full end-to-end workflow
// ============================================================

describe('MCP: full workflow end-to-end', () => {
  let client: Client;
  beforeEach(async () => { client = await createClientServer(); });

  it('submit -> schedule -> cancel -> reschedule -> status', async () => {
    // 1. Submit flights
    await submit(client, { flightNumber: 'IN', operationType: 'arrival', priority: 'high' });
    await submit(client, { flightNumber: 'OUT', operationType: 'departure', dependencies: ['IN'] });
    await submit(client, { flightNumber: 'IND', operationType: 'arrival' });

    // 2. Generate schedule — all 3 should be scheduled
    const r1 = parseResult(await client.callTool({ name: 'generate_schedule', arguments: {} }));
    expect(r1.scheduled_count).toBe(3);

    // 3. Cancel IN
    const cancel = parseResult(await client.callTool({ name: 'cancel_flight', arguments: { flightNumber: 'IN' } }));
    expect(cancel.cancelled).toBe('IN');
    expect(cancel.affectedDependents).toContain('OUT');

    // 4. Reschedule — OUT should be unschedulable, IND scheduled
    const r2 = parseResult(await client.callTool({ name: 'generate_schedule', arguments: {} }));
    expect(r2.scheduled_count).toBe(1);
    expect(r2.unschedulable_count).toBe(1);
    expect(r2.scheduled[0].flightNumber).toBe('IND');
    expect(r2.unschedulable[0].flightNumber).toBe('OUT');

    // 5. Status reflects final state
    const status = parseResult(await client.callTool({ name: 'get_airport_status', arguments: {} }));
    expect(status.flights.cancelled).toBe(1);
    expect(status.flights.scheduled).toBe(1);
    expect(status.flights.unschedulable).toBe(1);

    // 6. Bottleneck — only IND is scheduled, no deps
    const bn = parseResult(await client.callTool({ name: 'analyze_bottleneck', arguments: {} }));
    expect(bn.chain_length).toBe(1);
    expect(bn.critical_chain).toEqual(['IND']);
  });
});
