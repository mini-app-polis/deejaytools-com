import { z } from "zod";

export const UserRoleSchema = z.enum(["user", "admin"]);

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const IdParamSchema = z.object({
  id: z.string().min(1),
});

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
