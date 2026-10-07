# Juniper Salon: Waitlist Openings (Temporal prototype)

When a client cancels, Juniper Salon staff post the opening once. A Temporal Workflow offers it to the right waitlist clients **one at a time** (earliest sign-up first), waits for each reply, and **moves on automatically** until the slot is booked or the list runs out. It never double-books, and it keeps going even if the app crashes.

## Run it (one command)

Requirements: Node.js 20+ and Docker Desktop (running).

```bash
npm install && npm run dev
```

- Staff dashboard: <http://localhost:3000>
- Temporal Web UI: <http://localhost:8233>

Stop with `Ctrl+C`, then `npm run stop` to stop the Temporal container.

Other commands: `npm test` (Workflow tests, no Docker needed), `npm run typecheck`.

## Try it (2 minutes)

1. Open <http://localhost:3000>. The waitlist at the bottom is pre-filled with fictional clients.
2. Post an opening: **Cut & style · Carla · any afternoon time · reply window "30 seconds (demo)"**. Three clients match (Ava, Chloe, Finn). The rest are listed as not eligible, with the reason.
3. Ava gets the offer first. Click **Open their text ↗** to see the client's (simulated) text and **decline**. The offer moves to Chloe.
4. Don't reply for Chloe. After 30 seconds she times out and the offer moves to Finn on its own.
5. Accept as Finn. The opening shows **Filled**. Open Chloe's old link and press "Yes": she's told it's **no longer available**.
6. Also try **Cancel current offer** and **Stop offering** on a new opening.

**Crash test:** post an opening, press `Ctrl+C` while an offer is waiting, wait past the reply window, and run `npm run dev` again. The Workflow resumes exactly where it was: the expired offer is marked timed out and the next client is offered.

## How it meets Lena's needs

| Lena said | Prototype |
| --- | --- |
| "We lose track of who we contacted and who's next" | Each opening has a live view: who has the offer, who declined or timed out, who's still waiting, and an activity log. |
| Competing acceptances upset a client | One offer at a time. Accept/decline is a Temporal **Update** handled one at a time inside the Workflow, so only the first valid "yes" books. Late replies are told it's no longer available. |
| No consistent cutoff; depends on someone remembering | A **durable timer** (15 min default, 30 s for demos) moves on automatically. |
| Earliest sign-up first, matching service, availability, stylist | Eligibility and ordering are applied when the opening is posted. Skipped clients show the reason. |
| Mark unfilled if nobody accepts; staff can stop or cancel | Final status **Filled / Unfilled / Stopped**. Staff **Signals** for "Cancel current offer" and "Stop offering". |

## How Temporal is used

- **One Workflow per opening** (`openingWorkflow` in `src/workflows.ts`; the Workflow ID is shown on each card).
- **Durable waiting:** `condition(..., replyWindow)` waits for a reply, a staff action, or the timer. The timer lives on the Temporal server, so it still fires while the app is down.
- **Resuming:** after a Worker restart, the Workflow replays its history and carries on from the same client.
- **Recovering from failures:** texts and bookings are Activities with retries. The simulated SMS gateway **fails every first attempt on purpose** (set `FLAKY_SMS=false` to turn this off), so you can watch Temporal retry in the worker log and the Web UI.
- **Messages:** Update `respondToOffer` (client reply, synchronous answer), Signals `cancelCurrentOffer` / `stopOffering`, Query `getOpeningState` (dashboard).
- The dashboard lists openings straight from Temporal's visibility API, so the API keeps no state of its own about openings.

## Simulated or excluded

- **Text messages** are simulated: the worker logs each SMS, and the "Open their text" link stands in for the link a client would tap. A real SMS provider (e.g. Twilio) would replace `sendText` in `src/activities.ts`, with reply-by-text handling.
- **Square** is simulated: cancellations are posted by hand, and `bookAppointment` logs a fake confirmation instead of calling Square's Bookings API.
- **Waitlist** is an in-memory sample list standing in for the Google Sheet. It resets when the app restarts. Openings themselves are durable in Temporal.
- No login, no real client data, and no multi-location support. Everything runs locally.

## Repository map

- `src/workflows.ts`: opening Workflow, Update/Signal/Query handlers
- `src/activities.ts`: simulated SMS and Square booking
- `src/matching.ts`: eligibility rules and ordering (pure, deterministic)
- `src/api.ts`: Express API and Temporal Client
- `src/seed.ts`: fictional waitlist data
- `public/`: staff dashboard (`index.html`) and client offer page (`offer.html`)
- `tests/workflow.test.ts`: Workflow tests with time skipping
- `evidence/`: Temporal Web UI screenshot
