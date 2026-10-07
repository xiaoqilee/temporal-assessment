export type Service = "Cut & style" | "Color" | "Trim" | "Blowout";
export type Stylist = "Lena" | "Carla" | "Sam";
export type TimeOfDay = "morning" | "afternoon" | "evening";
export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

// One row of the waitlist (today this lives in Lena's Google Sheet).
export type WaitlistClient = {
  id: string;
  name: string;
  phone: string;
  service: Service;
  stylistPreference: Stylist | "Any";
  availableDays: Weekday[];
  availableTimes: TimeOfDay[];
  joinedAt: string; // ISO timestamp; earliest joiner is offered first
};

// A cancelled appointment slot that staff want to fill.
export type Opening = {
  id: string;
  service: Service;
  stylist: Stylist;
  startsAt: string; // local salon time, "YYYY-MM-DDTHH:mm"
  replyWindowSeconds: number;
};

export type CandidateStatus =
  | "waiting" // eligible, not offered yet
  | "offered" // currently holds the offer
  | "accepted"
  | "declined"
  | "timed_out"
  | "withdrawn" // staff cancelled the offer or stopped the process
  | "not_reached"; // slot was filled or stopped before their turn

export type Candidate = {
  client: WaitlistClient;
  status: CandidateStatus;
  offeredAt?: string;
  expiresAt?: string;
  respondedAt?: string;
};

export type OpeningPhase = "offering" | "filled" | "unfilled" | "stopped";

export type OpeningState = {
  opening: Opening;
  phase: OpeningPhase;
  currentClientId?: string;
  candidates: Candidate[];
  ineligible: { client: WaitlistClient; reason: string }[];
  history: { at: string; text: string }[];
};

export type OfferResponse = { clientId: string; accept: boolean };

export type OfferResult = {
  outcome: "booked" | "declined" | "no_longer_available";
  message: string;
};
