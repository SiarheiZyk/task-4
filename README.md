# ATC MCP Server

An AI-ready Air Traffic Control system built as a Model Context Protocol (MCP) server. It coordinates flight operations at a busy airport: accepts flight plans, schedules arrivals and departures safely, manages limited airport resources (runways, gates, ground crew), handles flight dependencies and cancellations, and exposes the full airport state to AI clients through MCP tools and resources.

## Table of Contents

- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
  - [MCP Inspector](#option-1-mcp-inspector-recommended-for-testing)
  - [Claude Desktop](#option-2-claude-desktop)
  - [Development Mode](#option-3-development-mode)
- [Tools Reference](#tools-reference)
  - [submit_flight](#submit_flight)
  - [generate_schedule](#generate_schedule)
  - [get_airport_status](#get_airport_status)
  - [cancel_flight](#cancel_flight)
  - [analyze_bottleneck](#analyze_bottleneck)
- [Resources Reference](#resources-reference)
  - [atc://flights/queue](#atcflightsqueue)
  - [atc://runways](#atcrunways)
  - [atc://timeline](#atctimeline)
- [Testing](#testing)

## Installation

**Prerequisites:** Node.js 20 LTS or newer.

```bash
cd task-4
npm install
npm run build
```

`npm install` downloads all dependencies. `npm run build` compiles TypeScript into the `dist/` directory. If both commands complete without errors, the server is ready to run.

To verify everything works:

```bash
npm test
```

Expected output: **5 test files, 74 tests passed**.

## Environment Variables

All airport limits are configured through environment variables. Every variable has a sensible default, so the server runs out of the box without setting anything. If you provide an invalid value (for example `RUNWAY_COUNT=0`), the server will refuse to start and print a clear error message explaining what's wrong.

### How to set environment variables

**Option A: Inline when running the server**

```bash
RUNWAY_COUNT=3 GATE_COUNT=15 node dist/index.js
```

**Option B: Inline with MCP Inspector**

```bash
RUNWAY_COUNT=3 GATE_COUNT=15 npm run inspector
```

**Option C: In Claude Desktop config (recommended for production)**

```json
{
  "mcpServers": {
    "atc-scheduler": {
      "command": "node",
      "args": ["/absolute/path/to/task-4/dist/index.js"],
      "env": {
        "RUNWAY_COUNT": "3",
        "GATE_COUNT": "15",
        "GROUND_CREW_COUNT": "20"
      }
    }
  }
}
```

**Option D: Create a `.env` file (copy from the template)**

```bash
cp .env.example .env
# Edit .env with your values
```

Note: the server does not load `.env` files automatically. Use option A, B, or C for actual runs.

### Variable reference

| Variable | Default | Constraints | Description |
|---|---|---|---|
| `RUNWAY_COUNT` | 2 | 1–20, integer | Number of runways at the airport. Each runway is 3000m long by default. |
| `GATE_COUNT` | 10 | 1–200, integer | Number of gates. Each flight occupies a gate for the operation duration plus turnaround time. |
| `GROUND_CREW_COUNT` | 20 | 1–500, integer | Number of ground crew members. Each flight requires one crew member for the duration of the operation. |
| `TAKEOFF_BUFFER_SEC` | 120 | ≥30, integer | Minimum seconds between two consecutive departures on the same runway. |
| `LANDING_BUFFER_SEC` | 90 | ≥30, integer | Minimum seconds between two consecutive arrivals on the same runway. |
| `MIXED_OPS_BUFFER_SEC` | 180 | ≥30, integer | Minimum seconds when switching between an arrival and a departure (or vice versa) on the same runway. |
| `GATE_TURNAROUND_SEC` | 2700 | ≥300, integer | How long a gate stays occupied after a flight completes (cleaning, restocking). Default is 45 minutes. |
| `DEPENDENCY_BUFFER_SEC` | 600 | ≥0, integer | Minimum wait time after a dependency flight completes before the dependent flight can start. Default is 10 minutes. |
| `MAX_HORIZON_SEC` | 21600 | ≥3600, integer | Maximum scheduling window. Flights that can't start and finish within this window are marked unschedulable. Default is 6 hours. |
| `DEFAULT_RUNWAY_LENGTH_M` | 3000 | ≥1000, integer | Length of each runway in meters. Flights with `minRunwayLengthMeters` exceeding this value cannot be scheduled. |
| `OPERATION_DURATION_SEC` | 180 | ≥30, integer | How long each flight occupies the runway (takeoff or landing). Default is 3 minutes. |

## Running the Server

### Option 1: MCP Inspector (recommended for testing)

MCP Inspector is a browser-based UI that lets you interact with the server manually — call tools, inspect resources, and see the full JSON responses.

```bash
npm run inspector
```

This starts the server and opens the Inspector. Look for a URL in the terminal output (usually `http://localhost:6274`). Open it in your browser.

**What you can do in Inspector:**

1. Go to the **Tools** tab — you'll see all 5 tools listed
2. Click on `submit_flight`, fill in the parameters (e.g., `flightNumber: "SU100"`, `operationType: "arrival"`, `priority: "high"`), and click **Run**
3. Call `generate_schedule` (no parameters needed) to compute the schedule
4. Call `get_airport_status` to see flight counts and resource usage
5. Switch to the **Resources** tab to browse `atc://flights/queue`, `atc://runways`, and `atc://timeline`

**Typical test flow in Inspector:**

```
1. submit_flight  →  { flightNumber: "AA100", operationType: "arrival", priority: "high" }
2. submit_flight  →  { flightNumber: "BB200", operationType: "departure", dependencies: ["AA100"] }
3. generate_schedule  →  (see scheduled flights and makespan)
4. Read resource atc://timeline  →  (see chronological operations)
5. analyze_bottleneck  →  (see critical chain: ["AA100", "BB200"])
```

### Option 2: Claude Desktop

#### Step 1: Build the server

```bash
cd task-4
npm install
npm run build
```

#### Step 2: Find the Claude Desktop config file

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

If the file doesn't exist, create it.

#### Step 3: Add the server configuration

```json
{
  "mcpServers": {
    "atc-scheduler": {
      "command": "node",
      "args": ["/absolute/path/to/task-4/dist/index.js"],
      "env": {
        "RUNWAY_COUNT": "2",
        "GATE_COUNT": "10",
        "GROUND_CREW_COUNT": "20"
      }
    }
  }
}
```

**Important:** Replace `/absolute/path/to/task-4` with the actual absolute path on your system. Relative paths do not work.

#### Step 4: Restart Claude Desktop

Fully quit Claude Desktop (use **Quit** from the system tray / menu bar, not just close the window), then reopen it.

#### Step 5: Verify the connection

Open a new chat in Claude Desktop and ask: *"What ATC tools are available?"*

Claude should respond with the list of 5 tools: `submit_flight`, `generate_schedule`, `get_airport_status`, `cancel_flight`, `analyze_bottleneck`.

**Troubleshooting:**

- If tools don't appear, check the log file: `~/Library/Logs/Claude/mcp-server-atc-scheduler.log` (macOS)
- Make sure the path in `args` is absolute and points to the compiled `dist/index.js` (not `src/index.ts`)
- Make sure you ran `npm run build` after any code changes

### Option 3: Development mode

If you don't want to rebuild after every change, you can run the server directly from TypeScript source using `tsx`:

```json
{
  "mcpServers": {
    "atc-scheduler-dev": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/task-4/src/index.ts"],
      "env": {
        "RUNWAY_COUNT": "2"
      }
    }
  }
}
```

This skips the build step but is slightly slower to start.

## Tools Reference

### `submit_flight`

Registers a new arrival or departure in the system. The flight goes into `pending` status and waits for `generate_schedule` to be called.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `flightNumber` | string (2–10 chars) | Yes | — | Unique flight identifier, e.g. `"SU1234"`, `"AA100"` |
| `operationType` | `"arrival"` or `"departure"` | Yes | — | Whether the flight is landing or taking off |
| `priority` | `"high"`, `"medium"`, or `"low"` | No | `"medium"` | Higher priority flights are scheduled first when competing for resources |
| `dependencies` | array of strings | No | `[]` | Flight numbers that must complete before this flight can start. Example: `["AA100"]` |
| `minRunwayLengthMeters` | integer (≥0) | No | — | Minimum runway length needed. If no runway is long enough, the flight is marked unschedulable. |

**Example call:**

```json
{
  "flightNumber": "SU1234",
  "operationType": "arrival",
  "priority": "high",
  "dependencies": [],
  "minRunwayLengthMeters": 2500
}
```

**Response:**

```
Flight SU1234 accepted (status: pending). Call generate_schedule to plan.
```

**Error case** (duplicate flight number):

```
Flight SU1234 already exists
```

---

### `generate_schedule`

Computes a fresh schedule for all pending flights. This completely replaces any previous schedule. Cancelled flights are excluded. The scheduler respects all resource constraints, separation buffers, dependencies, and the planning horizon.

**Parameters:** None.

**Response:**

```json
{
  "scheduled_count": 3,
  "unschedulable_count": 1,
  "makespan_sec": 960,
  "scheduled": [
    {
      "flightNumber": "SU100",
      "operationType": "arrival",
      "runwayId": "RW01",
      "gateId": "G01",
      "startTime": 0,
      "endTime": 180
    }
  ],
  "unschedulable": [
    {
      "flightNumber": "HV1",
      "reason": "No runway available with length >= 5000m"
    }
  ]
}
```

**Fields explained:**

- `scheduled_count` — number of flights that were successfully placed in the schedule
- `unschedulable_count` — number of flights that could not be scheduled
- `makespan_sec` — total schedule duration (latest operation end time), in seconds
- `scheduled` — array of scheduled operations with runway, gate, start/end times
- `unschedulable` — array of flights that couldn't be scheduled, each with a `reason`

**Possible unschedulable reasons:**

- `"No runway available with length >= Xm"` — flight needs a longer runway than available
- `"Dependency unscheduled"` — a required dependency flight was not scheduled (cancelled or also unschedulable)
- `"Circular dependency detected"` — flight is part of a dependency cycle
- `"No feasible slot within horizon"` — all resources are busy and the flight can't fit within the planning window

---

### `get_airport_status`

Returns a structured snapshot of the current airport state: flight counts, resource capacity and usage, blocked flights, and schedule completion time.

**Parameters:** None.

**Response:**

```json
{
  "flights": {
    "total": 5,
    "pending": 0,
    "scheduled": 4,
    "cancelled": 0,
    "unschedulable": 1,
    "arrivals": 2,
    "departures": 3
  },
  "resources": {
    "runways": { "capacity": 2, "used": 2 },
    "gates": { "capacity": 10, "used": 4 },
    "groundCrew": { "capacity": 20, "used": 4 }
  },
  "blockedFlights": [
    {
      "flightNumber": "HV1",
      "reason": "No runway available with length >= 5000m"
    }
  ],
  "scheduleCompletionTimeSec": 960
}
```

**Fields explained:**

- `flights` — counts by status (`pending`, `scheduled`, `cancelled`, `unschedulable`) and by type (`arrivals`, `departures`)
- `resources` — for each resource type: total `capacity` (from config) and how many are currently `used` in the schedule
- `blockedFlights` — list of unschedulable flights with their reasons
- `scheduleCompletionTimeSec` — when the last operation ends (null if no schedule exists yet)

---

### `cancel_flight`

Cancels a flight and removes it from the schedule. Any flights that depend on the cancelled flight are reset to `pending` status. You should call `generate_schedule` afterward to recompute the schedule without the cancelled flight.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `flightNumber` | string | Yes | The flight number to cancel |

**Response:**

```json
{
  "cancelled": "SU100",
  "affectedDependents": ["SU200", "SU300"],
  "note": "Re-run generate_schedule to refresh the plan."
}
```

**Error case** (flight doesn't exist):

```
Flight NOPE not found
```

---

### `analyze_bottleneck`

Identifies the critical path — the longest chain of dependent scheduled flights that determines the total schedule duration. Optimizing flights in this chain has the biggest impact on reducing the overall makespan.

**Parameters:** None.

**Response:**

```json
{
  "critical_chain": ["AA100", "CONNECT", "BB200"],
  "total_duration_sec": 1260,
  "chain_length": 3
}
```

**Fields explained:**

- `critical_chain` — ordered array of flight numbers forming the longest dependency chain
- `total_duration_sec` — total elapsed time of the chain (sum of operation durations + dependency buffers)
- `chain_length` — number of flights in the chain

If no schedule exists or there are no dependencies, returns an empty chain with duration 0.

## Resources Reference

Resources are read-only data endpoints that MCP clients can inspect at any time.

### `atc://flights/queue`

All flights grouped by their current status.

```json
{
  "pending": [
    { "flightNumber": "F3", "operationType": "arrival", "priority": "low", "dependencies": [], "status": "pending", "submittedAt": 3 }
  ],
  "scheduled": [
    { "flightNumber": "F1", "operationType": "arrival", "priority": "high", "dependencies": [], "status": "scheduled", "submittedAt": 1 }
  ],
  "cancelled": [],
  "unschedulable": [
    { "flightNumber": "HV1", "operationType": "departure", "status": "unschedulable", "reason": "No runway available with length >= 5000m" }
  ]
}
```

### `atc://runways`

Each runway with its physical properties and the list of operations assigned to it in the current schedule, sorted chronologically.

```json
[
  {
    "id": "RW01",
    "lengthMeters": 3000,
    "operationCount": 2,
    "operations": [
      { "flightNumber": "SU100", "operationType": "arrival", "startTime": 0, "endTime": 180 },
      { "flightNumber": "SU200", "operationType": "departure", "startTime": 360, "endTime": 540 }
    ]
  },
  {
    "id": "RW02",
    "lengthMeters": 3000,
    "operationCount": 0,
    "operations": []
  }
]
```

### `atc://timeline`

A flat chronological list of all scheduled operations, sorted by start time (then by runway ID for ties).

```json
{
  "totalOperations": 4,
  "timeline": [
    { "flightNumber": "SU100", "operationType": "arrival", "runwayId": "RW01", "gateId": "G01", "startTime": 0, "endTime": 180 },
    { "flightNumber": "SU300", "operationType": "arrival", "runwayId": "RW02", "gateId": "G02", "startTime": 0, "endTime": 180 },
    { "flightNumber": "SU200", "operationType": "departure", "runwayId": "RW01", "gateId": "G03", "startTime": 360, "endTime": 540 },
    { "flightNumber": "SU400", "operationType": "departure", "runwayId": "RW02", "gateId": "G04", "startTime": 360, "endTime": 540 }
  ]
}
```

## Testing

```bash
npm test
```

Expected: **5 test files, 74 tests passed**.

The test suite covers:

| Test file | Tests | What it covers |
|---|---|---|
| `scheduler.test.ts` | 7 | Core algorithm: mixed operations, no runway overlap, runway length rejection, dependencies, determinism, cancellation, bottleneck |
| `scenarios.test.ts` | 3 | The three validation scenarios: Morning Rush, Heavy Hauler, Connecting Flight |
| `mcp.test.ts` | 11 | MCP integration via InMemoryTransport: all 5 tools and all 3 resources through the protocol |
| `coverage.test.ts` | 38 | Edge cases: separation buffers, gate turnaround, ground crew limits, planning horizon, circular dependencies, priority tie-breaking, multi-runway usage, empty schedule, diamond dependencies, state management |
| `mcp-coverage.test.ts` | 15 | MCP-level edge cases: error handling, status before/after operations, empty resources, full end-to-end workflow |

To run tests in watch mode during development:

```bash
npm run test:watch
```
