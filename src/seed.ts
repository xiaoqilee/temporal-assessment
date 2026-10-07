import type { WaitlistClient, Weekday } from "./types";

const ALL_DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Fictional clients standing in for the rows of the salon's Google Sheet.
export function seedWaitlist(): WaitlistClient[] {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  return [
    {
      id: "c-ava", name: "Ava Thompson", phone: "(555) 010-0101", service: "Cut & style",
      stylistPreference: "Carla", availableDays: ALL_DAYS, availableTimes: ["morning", "afternoon"],
      joinedAt: daysAgo(12),
    },
    {
      id: "c-ben", name: "Ben Ortiz", phone: "(555) 010-0102", service: "Color",
      stylistPreference: "Any", availableDays: ALL_DAYS, availableTimes: ["afternoon", "evening"],
      joinedAt: daysAgo(10),
    },
    {
      id: "c-chloe", name: "Chloe Park", phone: "(555) 010-0103", service: "Cut & style",
      stylistPreference: "Any", availableDays: ALL_DAYS, availableTimes: ["afternoon", "evening"],
      joinedAt: daysAgo(8),
    },
    {
      id: "c-dev", name: "Dev Patel", phone: "(555) 010-0104", service: "Cut & style",
      stylistPreference: "Sam", availableDays: ALL_DAYS, availableTimes: ["morning", "afternoon", "evening"],
      joinedAt: daysAgo(6),
    },
    {
      id: "c-emma", name: "Emma Rossi", phone: "(555) 010-0105", service: "Cut & style",
      stylistPreference: "Carla", availableDays: ["Sat", "Sun"], availableTimes: ["morning", "afternoon"],
      joinedAt: daysAgo(5),
    },
    {
      id: "c-finn", name: "Finn Walsh", phone: "(555) 010-0106", service: "Cut & style",
      stylistPreference: "Any", availableDays: ALL_DAYS, availableTimes: ["morning", "afternoon", "evening"],
      joinedAt: daysAgo(3),
    },
    {
      id: "c-gia", name: "Gia Moreno", phone: "(555) 010-0107", service: "Trim",
      stylistPreference: "Lena", availableDays: ALL_DAYS, availableTimes: ["morning", "afternoon"],
      joinedAt: daysAgo(2),
    },
  ];
}
