import { Context } from "@temporalio/activity";
import type { Opening, WaitlistClient } from "./types";
import { describeOpening } from "./matching";

// Simulated side effects. In production these would call an SMS provider
// (e.g. Twilio) and Square's Bookings API. Temporal retries them on failure.

const flakySms = process.env.FLAKY_SMS !== "false";

export async function sendText(input: {
  to: WaitlistClient;
  body: string;
}): Promise<void> {
  const { attempt } = Context.current().info;
  // Simulate an unreliable SMS gateway: the first attempt of every text fails,
  // so the Web UI shows Temporal retrying it automatically.
  if (flakySms && attempt === 1) {
    throw new Error("Simulated SMS gateway timeout (Temporal will retry)");
  }
  console.log(`[SMS to ${input.to.name} ${input.to.phone}] ${input.body}`);
}

export async function bookAppointment(input: {
  opening: Opening;
  client: WaitlistClient;
}): Promise<string> {
  const confirmation = `SQ-${input.opening.id.slice(-6).toUpperCase()}`;
  console.log(
    `[Square] Booked ${input.client.name} into ${describeOpening(input.opening)} (${confirmation})`,
  );
  return confirmation;
}
