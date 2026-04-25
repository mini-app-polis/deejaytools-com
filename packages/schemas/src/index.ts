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

export const QueueTypeSchema = z.enum(["priority", "non_priority", "active"]);

export const createCheckinBodySchema = z
  .object({
    sessionId: z.string().min(1),
    divisionName: z.string().min(1),
    entityPairId: z.string().nullish(),
    entitySoloUserId: z.string().nullish(),
    songId: z.string().min(1),
    notes: z.string().nullish(),
    eventRegistrationId: z.string().nullish(),
  })
  .refine(
    (b) => Boolean(b.entityPairId) !== Boolean(b.entitySoloUserId),
    { message: "Exactly one of entityPairId / entitySoloUserId" }
  );

export const EventStatusSchema = z.enum([
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);

export const PartnerRoleSchema = z.enum(["leader", "follower"]);
export type PartnerRole = z.infer<typeof PartnerRoleSchema>;
