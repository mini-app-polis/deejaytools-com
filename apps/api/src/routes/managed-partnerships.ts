/**
 * Managed partnerships routes (stubbed persistence).
 *
 * Future `managed_partnerships` table:
 *   - id                  text PRIMARY KEY
 *   - user_id             text NOT NULL → users.id (the manager)
 *   - leader_first_name   text NOT NULL
 *   - leader_last_name    text NOT NULL
 *   - follower_first_name text NOT NULL
 *   - follower_last_name  text NOT NULL
 *   - created_at          bigint NOT NULL
 *   - updated_at          bigint NOT NULL
 *
 * Private to the manager — no email, no account linking.
 */
import { error, success } from "common-typescript-utils";
import { createManagedPartnershipBodySchema } from "@deejaytools/schemas";
import { Hono } from "hono";
import { zValidator } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

export const managedPartnershipsRoutes = new Hono();

managedPartnershipsRoutes.get("/", requireAuth, async (c) => {
  // STUB(db): needs `managed_partnerships` table — remove when schema lands
  return c.json(success([], { stub: true }), 200);
});

managedPartnershipsRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createManagedPartnershipBodySchema),
  async (c) => {
    // STUB(db): needs `managed_partnerships` table — remove when schema lands
    return c.json(
      error(
        "DB_STUB_PENDING",
        "Managed partnerships are not persisted yet — database schema pending."
      ),
      501
    );
  }
);

managedPartnershipsRoutes.patch(
  "/:id",
  requireAuth,
  zValidator("json", createManagedPartnershipBodySchema),
  async (c) => {
    // STUB(db): needs `managed_partnerships` table — remove when schema lands
    return c.json(
      error(
        "DB_STUB_PENDING",
        "Managed partnerships are not persisted yet — database schema pending."
      ),
      501
    );
  }
);

managedPartnershipsRoutes.delete("/:id", requireAuth, async (c) => {
  // STUB(db): needs `managed_partnerships` table — remove when schema lands
  return c.json(
    error(
      "DB_STUB_PENDING",
      "Managed partnerships are not persisted yet — database schema pending."
    ),
    501
  );
});
