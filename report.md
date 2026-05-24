# Implementation Report

## Scheduling Approach and Key Decisions

The core idea behind the scheduler is straightforward: figure out the right order, then assign flights one by one to the earliest available slot.

First, flights are sorted so that dependencies come first — if a connecting departure needs an arrival to land before it, the arrival gets processed first. Among flights with no dependency constraints between them, higher-priority ones go ahead. This ordering step uses a well-known graph algorithm (topological sort) which also naturally detects impossible situations like circular dependencies.

Then the scheduler walks through the sorted list and for each flight picks the best available combination of runway, gate, and ground crew. "Best" simply means "earliest possible start." It respects all the configured buffers — time between consecutive takeoffs, time between landings, extra gap when switching from arrivals to departures, gate turnaround, and the dependency buffer. If a flight can't fit anywhere within the planning window, it gets marked as unschedulable with a clear reason.

The key decision was to keep it simple. A greedy approach — always pick the earliest slot — is easy to understand, easy to debug, fast, and gives the same result every time. I didn't need a complex optimizer for this scope.

Other decisions that shaped the implementation:
- All state lives in memory. No database — the MCP client drives the workflow, and the server doesn't need to survive restarts.
- Configuration comes from environment variables, validated at startup. Bad values cause an immediate failure with a clear message rather than weird behavior later.
- The server uses stdio transport (stdin/stdout) rather than HTTP. It's the simplest way to connect to Claude Desktop.

## Tools and Techniques

**AI-assisted development.** I used Claude (via Claude Code CLI) extensively throughout the project. The workflow was:
1. I started by creating a detailed plan — breaking the task into steps, defining the file structure, choosing the tech stack, and writing out the algorithm before any code.
2. Claude helped generate the initial implementation based on that plan — the type definitions, state management, scheduling algorithm, MCP tool/resource registrations, and tests.
3. I then used Claude to review the implementation against the requirements, identify gaps (like missing ground crew enforcement, missing cycle detection, build configuration issues), and fix them.
4. Claude also generated comprehensive test coverage — unit tests, scenario tests, and MCP integration tests via InMemoryTransport.

This approach — plan first, generate with AI, then review and iterate — worked well. The AI was especially useful for boilerplate (MCP tool registration, Zod schemas, test scaffolding) and for catching requirement gaps I might have missed on manual review.

**Tech stack:**
- TypeScript with strict mode for type safety
- MCP SDK (`@modelcontextprotocol/sdk`) for the protocol layer
- Zod for input and configuration validation
- Vitest for testing
- MCP Inspector for manual testing in the browser during development

## What Worked

- **Planning before coding.** Having a step-by-step plan with file structure, types, and algorithm pseudocode made the actual implementation much smoother. I knew what each file should do before writing it.
- **AI for review and gap analysis.** After the initial implementation, asking Claude to compare the code against the original requirements caught several issues: the build didn't compile (missing TypeScript config), the test runner config was empty, ground crew wasn't enforced, circular dependencies were silently ignored. These would have been easy to miss.
- **Simple algorithm choice.** The greedy scheduler handles all three validation scenarios from the spec and is easy to reason about. No need to over-engineer.
- **Modular file structure.** Keeping state, scheduling logic, and MCP adapters in separate files made it possible to test the core algorithm without involving the protocol layer.

## What Did Not Work

- **Jumping to HTTP transport too early.** I initially tried an HTTP-based transport thinking it would be more flexible. It added unnecessary complexity (ports, CORS, connection handling) for what turned out to be a local stdio-based integration. Had to revert.
- **Overlooking "obvious" requirements.** Ground crew count was in the config from the start but the scheduler simply didn't use it. The same with circular dependency detection — the topological sort dropped cyclic flights silently without marking them as unschedulable. Both needed explicit fixes after review.
- **Overcomplicating separation logic.** I briefly considered implementing realistic ICAO wake turbulence categories for runway separation. That was way beyond what the task asked for. Replaced with three simple configurable buffers (takeoff, landing, mixed), which is exactly what was needed.
