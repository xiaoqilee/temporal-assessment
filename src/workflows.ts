import {
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import { describeOpening, rankCandidates } from "./matching";
import type {
  Candidate,
  OfferResponse,
  OfferResult,
  Opening,
  OpeningState,
  WaitlistClient,
} from "./types";

const { sendText, bookAppointment } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { initialInterval: "1 second", backoffCoefficient: 2, maximumInterval: "30 seconds" },
});

export const getOpeningState = defineQuery<OpeningState>("getOpeningState");
// An Update (not a Signal) so the client gets an immediate, authoritative
// answer. Workflow handlers run one at a time, so only one acceptance can win.
export const respondToOffer = defineUpdate<OfferResult, [OfferResponse]>("respondToOffer");
export const cancelCurrentOffer = defineSignal("cancelCurrentOffer");
export const stopOffering = defineSignal("stopOffering");

// One Workflow per cancelled appointment. It offers the slot to one eligible
// client at a time (earliest waitlist sign-up first), durably waits for a reply
// with a timer, and moves on automatically until the slot is filled or the
// list runs out. It survives Worker restarts without losing its place.
export async function openingWorkflow(input: {
  opening: Opening;
  waitlist: WaitlistClient[];
}): Promise<OpeningState> {
  const { opening } = input;
  const { eligible, ineligible } = rankCandidates(input.waitlist, opening);
  const state: OpeningState = {
    opening,
    phase: "offering",
    candidates: eligible.map((client): Candidate => ({ client, status: "waiting" })),
    ineligible,
    history: [],
  };
  const log = (text: string) => state.history.push({ at: new Date().toISOString(), text });
  const details = describeOpening(opening);
  let stopRequested = false;

  const current = () => state.candidates.find((c) => c.client.id === state.currentClientId);

  setHandler(getOpeningState, () => state);

  setHandler(respondToOffer, ({ clientId, accept }): OfferResult => {
    const candidate = state.candidates.find((c) => c.client.id === clientId);
    if (state.phase !== "offering" || !candidate || candidate.status !== "offered") {
      return {
        outcome: "no_longer_available",
        message: "Sorry, this opening is no longer available. You're still on the waitlist.",
      };
    }
    candidate.respondedAt = new Date().toISOString();
    if (accept) {
      candidate.status = "accepted";
      state.phase = "filled"; // reserved immediately; nobody else can accept now
      log(`${candidate.client.name} accepted`);
      return { outcome: "booked", message: `You're booked: ${details}. See you then!` };
    }
    candidate.status = "declined";
    log(`${candidate.client.name} declined`);
    return { outcome: "declined", message: "No problem, thanks for letting us know." };
  });

  setHandler(cancelCurrentOffer, () => {
    const candidate = current();
    if (state.phase === "offering" && candidate?.status === "offered") {
      candidate.status = "withdrawn";
      log(`Staff cancelled the offer to ${candidate.client.name}`);
    }
  });

  setHandler(stopOffering, () => {
    if (state.phase === "offering") stopRequested = true;
  });

  log(
    `Opening posted: ${details}. ${eligible.length} eligible of ${input.waitlist.length} on the waitlist.`,
  );

  for (const candidate of state.candidates) {
    if (stopRequested || state.phase !== "offering") break;

    state.currentClientId = candidate.client.id;
    candidate.status = "offered";
    candidate.offeredAt = new Date().toISOString();
    candidate.expiresAt = new Date(Date.now() + opening.replyWindowSeconds * 1000).toISOString();
    log(`Offered to ${candidate.client.name}`);
    await sendText({
      to: candidate.client,
      body: `Juniper Salon: an earlier appointment opened up: ${details}. Reply within ${formatWindow(opening.replyWindowSeconds)} to accept or decline.`,
    });

    // Durable timer: waits for a reply, a staff action, or the reply window.
    const responded = await condition(
      () => candidate.status !== "offered" || stopRequested,
      opening.replyWindowSeconds * 1000,
    );

    // Handlers mutate status while we wait, so re-read it (defeats TS narrowing).
    const status = statusOf(candidate);
    if (status === "accepted") {
      const confirmation = await bookAppointment({ opening, client: candidate.client });
      log(`Booked in Square (${confirmation})`);
      await sendText({ to: candidate.client, body: `Juniper Salon: you're confirmed for ${details}.` });
      break;
    }
    if (!responded) {
      candidate.status = "timed_out";
      log(`${candidate.client.name} did not reply in time`);
    }
    if (stopRequested && statusOf(candidate) === "offered") {
      candidate.status = "withdrawn";
    }
    if (statusOf(candidate) === "timed_out" || statusOf(candidate) === "withdrawn") {
      await sendText({
        to: candidate.client,
        body: "Juniper Salon: that opening is no longer available. You're still on the waitlist.",
      });
    }
  }

  state.currentClientId = undefined;
  for (const candidate of state.candidates) {
    if (candidate.status === "waiting") candidate.status = "not_reached";
  }
  if (state.phase === "offering") {
    if (stopRequested) {
      state.phase = "stopped";
      log("Staff stopped offering this opening");
    } else {
      state.phase = "unfilled";
      log("Nobody accepted; opening marked unfilled");
    }
  }
  return state;
}

function statusOf(candidate: Candidate): Candidate["status"] {
  return candidate.status;
}

function formatWindow(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} minutes` : `${seconds} seconds`;
}
