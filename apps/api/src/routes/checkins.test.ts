import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessEnvelope,
  assertValidation400,
  authHeaders,
  adminHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/auth.js")>();
  const { mockRequireAdmin, mockRequireAuth } = await import("../test/mocks.js");
  return {
    ...actual,
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});

const BASE = "/v1/checkins";
const now = Date.now();

const openSession = {
  id: "sess1",
  eventId: null as string | null,
  name: "S",
  date: null as string | null,
  checkinOpensAt: now - 10_000,
  floorTrialStartsAt: now - 5000,
  floorTrialEndsAt: now + 7_200_000,
  activePriorityMax: 6,
  activeNonPriorityMax: 4,
  status: "checkin_open" as const,
  createdBy: "user_admin123",
  createdAt: now,
};

const futureSession = {
  ...openSession,
  checkinOpensAt: now + 60_000,
};

const closedSession = {
  ...openSession,
  floorTrialEndsAt: now - 1000,
};

const eventSession = {
  ...openSession,
  eventId: "evt_1",
};

const ownedSong = { id: "song1", managedPartnershipId: null as string | null, partnerId: null as string | null };

const testPair = { userAId: "user_test123", partnerBId: null };

function managedSong(songId: string, managedPartnershipId: string) {
  return { id: songId, managedPartnershipId, partnerId: null as string | null };
}

describe("POST /v1/checkins", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when entity XOR validation fails", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when check-in has not opened yet", async () => {
    enqueueSelectResult([futureSession]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when check-in is closed", async () => {
    enqueueSelectResult([closedSession]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when user is not pair leader", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([{ userAId: "other_user", partnerBId: null }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when entity already has a live queue entry", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([testPair]);
    enqueueSelectResult([{ id: "qe1" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 400 when the song has not been submitted to the session event", async () => {
    enqueueSelectResult([eventSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([testPair]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toBe(
      "This song hasn't been submitted to this event. Add it to the event on My Content before checking in."
    );
  });

  it("returns 201 when the song has been submitted to the session event", async () => {
    enqueueSelectResult([eventSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([testPair]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ id: "sub_1" }]);
    enqueueSelectResult([eventSession]);
    enqueueSelectResult([{ isPriority: true, priorityRunLimit: 3 }]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ n: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.initialQueue).toBe("priority");
  });

  it("skips the submission gate for sessions with no event", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([testPair]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: false, priorityRunLimit: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("checks in a portal-upload song using entityPairId for the placeholder partner pair", async () => {
    vi.mocked(mockDb.insert).mockClear();
    const portalSong = {
      id: "song_portal",
      managedPartnershipId: null as string | null,
      partnerId: "placeholder_p1",
    };
    const placeholderPair = { userAId: "user_test123", partnerBId: "placeholder_p1" };

    enqueueSelectResult([openSession]);
    enqueueSelectResult([portalSong]);
    enqueueSelectResult([placeholderPair]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: false, priorityRunLimit: 0 }]);

    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Teams",
        entityPairId: "p1",
        songId: "song_portal",
      }),
    });
    expect(res.status).toBe(201);

    const checkinInsert = vi.mocked(mockDb.insert).mock.results[0]?.value?.values as ReturnType<typeof vi.fn>;
    expect(checkinInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entityPairId: "p1",
        entitySoloUserId: null,
        songId: "song_portal",
      })
    );
  });

  it("returns 201 for pair check-in into priority division → priority queue", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([testPair]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: true, priorityRunLimit: 3 }]);
    enqueueSelectResult([{ n: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.initialQueue).toBe("priority");
  });

  it("returns 201 for non-priority division → non_priority", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([testPair]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: false, priorityRunLimit: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    expect(body.data.initialQueue).toBe("non_priority");
  });

  it("demotes to non_priority when session run limit reached", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([testPair]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: true, priorityRunLimit: 3 }]);
    enqueueSelectResult([{ n: 3 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    expect(body.data.initialQueue).toBe("non_priority");
  });

  it("returns 400 for solo check-in for someone else", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([ownedSong]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entitySoloUserId: "other_user",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 201 for valid solo check-in for current user", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: false, priorityRunLimit: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entitySoloUserId: "user_test123",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.initialQueue).toBe("non_priority");
  });

  it("returns 403 when a non-admin passes on_behalf_of_user_id", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        songId: "song1",
        on_behalf_of_user_id: "user_target",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 201 when an admin checks in on behalf of another user", async () => {
    const targetUserId = "user_target";
    enqueueSelectResult([{ id: targetUserId }]);
    enqueueSelectResult([eventSession]);
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ id: "sub_1" }]);
    enqueueSelectResult([eventSession]);
    enqueueSelectResult([{ isPriority: true, priorityRunLimit: 3 }]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ n: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        songId: "song1",
        on_behalf_of_user_id: targetUserId,
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.initialQueue).toBe("priority");
  });

  it("returns 404 when session not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "missing_session",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when both entityPairId and entitySoloUserId provided", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        entitySoloUserId: "user_test123",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  describe("managed partnership entity", () => {
    const managedBody = (songId: string) => ({
      sessionId: "sess1",
      divisionName: "Classic",
      entitySoloUserId: "user_test123",
      songId,
    });

    function enqueueManagedAdmission(runCount = 0) {
      enqueueSelectResult([openSession]);
      enqueueSelectResult([{ isPriority: true, priorityRunLimit: 3 }]);
      enqueueSelectResult([{ n: runCount }]);
    }

    it("allows two different managed partnerships to check into the same session", async () => {
      enqueueSelectResult([openSession]);
      enqueueSelectResult([managedSong("song_mp1", "mp1")]);
      enqueueSelectResult([{ id: "mp1", userId: "user_test123" }]);
      enqueueSelectResult([]);
      enqueueManagedAdmission(0);

      const first = await app.request(BASE, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(managedBody("song_mp1")),
      });
      expect(first.status).toBe(201);

      resetSelectQueue();
      enqueueSelectResult([openSession]);
      enqueueSelectResult([managedSong("song_mp2", "mp2")]);
      enqueueSelectResult([{ id: "mp2", userId: "user_test123" }]);
      enqueueSelectResult([]);
      enqueueManagedAdmission(0);

      const second = await app.request(BASE, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(managedBody("song_mp2")),
      });
      expect(second.status).toBe(201);
    });

    it("rejects a duplicate check-in for the same managed partnership", async () => {
      enqueueSelectResult([openSession]);
      enqueueSelectResult([managedSong("song_mp1", "mp1")]);
      enqueueSelectResult([{ id: "mp1", userId: "user_test123" }]);
      enqueueSelectResult([{ id: "qe_existing" }]);

      const res = await app.request(BASE, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(managedBody("song_mp1")),
      });
      expect(res.status).toBe(409);
    });

    it("computes admission run counts per managed partnership", async () => {
      enqueueSelectResult([openSession]);
      enqueueSelectResult([managedSong("song_mp1", "mp1")]);
      enqueueSelectResult([{ id: "mp1", userId: "user_test123" }]);
      enqueueSelectResult([]);
      enqueueManagedAdmission(3);

      const res = await app.request(BASE, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(managedBody("song_mp1")),
      });
      expect(res.status).toBe(201);
      const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
      expect(body.data.initialQueue).toBe("non_priority");

      resetSelectQueue();
      enqueueSelectResult([openSession]);
      enqueueSelectResult([managedSong("song_mp2", "mp2")]);
      enqueueSelectResult([{ id: "mp2", userId: "user_test123" }]);
      enqueueSelectResult([]);
      enqueueManagedAdmission(0);

      const other = await app.request(BASE, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(managedBody("song_mp2")),
      });
      expect(other.status).toBe(201);
      const otherBody = await readJson<SuccessEnvelope<{ initialQueue: string }>>(other);
      expect(otherBody.data.initialQueue).toBe("priority");
    });
  });
});
