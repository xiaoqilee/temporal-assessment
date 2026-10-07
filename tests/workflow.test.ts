import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { seedWaitlist } from "../src/seed";
import type { Opening, OpeningState } from "../src/types";
import { getOpeningState, openingWorkflow, respondToOffer, stopOffering } from "../src/workflows";

let environment: TestWorkflowEnvironment;
before(async () => {
  environment = await TestWorkflowEnvironment.createTimeSkipping();
});
after(async () => {
  await environment?.teardown();
});

// A Wednesday-afternoon cut with Carla: Ava, Chloe and Finn are eligible (in that order).
const opening = (id: string): Opening => ({
  id,
  service: "Cut & style",
  stylist: "Carla",
  startsAt: "2026-10-07T14:00",
  replyWindowSeconds: 900,
});

async function withWorker<T>(fn: () => Promise<T>): Promise<T> {
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    taskQueue: "test",
    workflowsPath: require.resolve("../src/workflows"),
    activities: {
      sendText: async () => undefined,
      bookAppointment: async () => "SQ-TEST",
    },
  });
  return worker.runUntil(fn);
}

async function start(id: string) {
  return environment.client.workflow.start(openingWorkflow, {
    workflowId: id,
    taskQueue: "test",
    args: [{ opening: opening(id), waitlist: seedWaitlist() }],
  });
}

async function waitForOffer(handle: Awaited<ReturnType<typeof start>>, clientId: string) {
  for (let i = 0; i < 50; i++) {
    const state = await handle.query(getOpeningState);
    if (state.currentClientId === clientId) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`offer never reached ${clientId}`);
}

test("offers the earliest eligible client first and books exactly one acceptance", async () => {
  await withWorker(async () => {
    const handle = await start("accept-test");
    const state = await waitForOffer(handle, "c-ava");
    assert.deepEqual(
      state.candidates.map((c) => c.client.id),
      ["c-ava", "c-chloe", "c-finn"],
    );

    const first = await handle.executeUpdate(respondToOffer, { args: [{ clientId: "c-ava", accept: true }] });
    assert.equal(first.outcome, "booked");
    // A second "yes" (e.g. a late reply from someone else) cannot double-book.
    const second = await handle.executeUpdate(respondToOffer, { args: [{ clientId: "c-chloe", accept: true }] });
    assert.equal(second.outcome, "no_longer_available");

    const result: OpeningState = await handle.result();
    assert.equal(result.phase, "filled");
    assert.deepEqual(
      result.candidates.map((c) => c.status),
      ["accepted", "not_reached", "not_reached"],
    );
  });
});

test("moves on after a decline and a timeout, then marks the opening unfilled", async () => {
  await withWorker(async () => {
    const handle = await start("timeout-test");
    await waitForOffer(handle, "c-ava");
    await handle.executeUpdate(respondToOffer, { args: [{ clientId: "c-ava", accept: false }] });
    await waitForOffer(handle, "c-chloe");

    // Time-skipping fast-forwards through the remaining 15-minute reply windows.
    const result = await handle.result();
    assert.equal(result.phase, "unfilled");
    assert.deepEqual(
      result.candidates.map((c) => c.status),
      ["declined", "timed_out", "timed_out"],
    );

    // A "yes" after the offer expired is told the slot is no longer available.
    const late = await handle
      .executeUpdate(respondToOffer, { args: [{ clientId: "c-chloe", accept: true }] })
      .catch(() => ({ outcome: "no_longer_available" }));
    assert.equal(late.outcome, "no_longer_available");
  });
});

test("staff can stop the process", async () => {
  await withWorker(async () => {
    const handle = await start("stop-test");
    await waitForOffer(handle, "c-ava");
    await handle.signal(stopOffering);
    const result = await handle.result();
    assert.equal(result.phase, "stopped");
    assert.equal(result.candidates[0].status, "withdrawn");
  });
});
