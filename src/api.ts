import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client, Connection, WorkflowNotFoundError } from "@temporalio/client";
import express, { type NextFunction, type Request, type Response } from "express";
import type {
  OfferResult,
  Opening,
  OpeningState,
  WaitlistClient,
} from "./types";
import { cancelCurrentOffer, getOpeningState, openingWorkflow, respondToOffer, stopOffering } from "./workflows";
import { seedWaitlist } from "./seed";

const TASK_QUEUE = "juniper-waitlist";
const app = express();
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Simulated stand-in for the salon's Google Sheet waitlist (in memory).
const waitlist: WaitlistClient[] = seedWaitlist();

let clientPromise: Promise<Client> | undefined;
function getClient(): Promise<Client> {
  clientPromise ??= Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  }).then((connection) => new Client({ connection, namespace: "default" }));
  return clientPromise;
}

app.get("/api/waitlist", (_request, response) => {
  response.json(waitlist);
});

app.post("/api/waitlist", (request, response) => {
  const body = request.body as Partial<WaitlistClient>;
  if (!body.name || !body.phone || !body.service || !body.availableDays?.length || !body.availableTimes?.length) {
    response.status(400).json({ error: "Name, mobile number, service, at least one day and one time are required." });
    return;
  }
  const client: WaitlistClient = {
    id: `c-${randomUUID().slice(0, 8)}`,
    name: body.name,
    phone: body.phone,
    service: body.service,
    stylistPreference: body.stylistPreference ?? "Any",
    availableDays: body.availableDays,
    availableTimes: body.availableTimes,
    joinedAt: new Date().toISOString(),
  };
  waitlist.push(client);
  response.status(201).json(client);
});

app.post("/api/openings", async (request, response) => {
  const body = request.body as Partial<Opening>;
  if (!body.service || !body.stylist || !body.startsAt) {
    response.status(400).json({ error: "Service, stylist and start time are required." });
    return;
  }
  const opening: Opening = {
    id: `opening-${body.startsAt.replace(/[^0-9]/g, "")}-${randomUUID().slice(0, 6)}`,
    service: body.service,
    stylist: body.stylist,
    startsAt: body.startsAt,
    replyWindowSeconds: Number(body.replyWindowSeconds) || 900,
  };
  const client = await getClient();
  await client.workflow.start(openingWorkflow, {
    workflowId: opening.id,
    taskQueue: TASK_QUEUE,
    // Snapshot of the waitlist at the moment the cancellation is posted.
    args: [{ opening, waitlist: structuredClone(waitlist) }],
  });
  response.status(201).json({ id: opening.id });
});

app.get("/api/openings", async (_request, response) => {
  const client = await getClient();
  const ids: string[] = [];
  for await (const execution of client.workflow.list({
    query: `WorkflowType = 'openingWorkflow' AND TaskQueue = '${TASK_QUEUE}'`,
  })) {
    ids.push(execution.workflowId);
    if (ids.length >= 20) break;
  }
  const states = await Promise.all(
    ids.map((id) =>
      client.workflow
        .getHandle(id)
        .query(getOpeningState)
        .catch(() => undefined),
    ),
  );
  response.json(states.filter((state): state is OpeningState => Boolean(state)));
});

app.get("/api/openings/:id", async (request, response) => {
  const client = await getClient();
  const state = await client.workflow.getHandle(request.params.id).query(getOpeningState);
  response.json(state);
});

// Called from the client's (simulated) text-message link.
app.post("/api/openings/:id/respond", async (request, response) => {
  const { clientId, accept } = request.body as { clientId: string; accept: boolean };
  const client = await getClient();
  try {
    const result = await client.workflow
      .getHandle(request.params.id)
      .executeUpdate(respondToOffer, { args: [{ clientId, accept: Boolean(accept) }] });
    response.json(result);
  } catch (error) {
    // The Workflow already finished (filled, unfilled or stopped).
    const result: OfferResult = {
      outcome: "no_longer_available",
      message: "Sorry, this opening is no longer available. You're still on the waitlist.",
    };
    if (error instanceof WorkflowNotFoundError || isClosedWorkflowError(error)) {
      response.json(result);
      return;
    }
    throw error;
  }
});

app.post("/api/openings/:id/cancel-offer", async (request, response) => {
  const client = await getClient();
  await client.workflow.getHandle(request.params.id).signal(cancelCurrentOffer);
  response.status(202).json({ accepted: true });
});

app.post("/api/openings/:id/stop", async (request, response) => {
  const client = await getClient();
  await client.workflow.getHandle(request.params.id).signal(stopOffering);
  response.status(202).json({ accepted: true });
});

function isClosedWorkflowError(error: unknown): boolean {
  const text = String((error as Error)?.message ?? error);
  return /already completed|workflow execution already|not found|closed/i.test(text);
}

app.use(
  (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error(error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  },
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Juniper Salon waitlist is available at http://localhost:${port}`));
