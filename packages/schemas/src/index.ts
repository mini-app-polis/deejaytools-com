import { z } from "zod";

export const DivisionSchema = z.enum([
  "Newcomer",
  "Novice",
  "Intermediate",
  "Advanced",
  "All-Star",
  "Champion",
  "Invitational",
  "Other",
]);

export const SessionStatusSchema = z.enum([
  "scheduled",
  "checkin_open",
  "in_progress",
  "completed",
  "cancelled",
]);

export const CheckinStatusSchema = z.enum([
  "waiting",
  "on_deck",
  "running",
  "completed",
  "withdrawn",
]);

export const QueueTypeSchema = z.enum(["priority", "standard"]);

export const EventStatusSchema = z.enum([
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);

export const PartnerRoleSchema = z.enum(["leader", "follower"]);
export type PartnerRole = z.infer<typeof PartnerRoleSchema>;
