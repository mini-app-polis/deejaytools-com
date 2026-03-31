import { CommonErrors } from "@deejaytools/ts-utils";
import type { Context, MiddlewareHandler } from "hono";
import { vi } from "vitest";

let selectResultQueue: unknown[][] = [];

export function resetSelectQueue() {
  selectResultQueue = [];
}

export function enqueueSelectResult(rows: unknown[]) {
  selectResultQueue.push(rows);
}

function drainSelect(): unknown[] {
  return (selectResultQueue.shift() ?? []) as unknown[];
}

type DbChain = {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  then: (
    onfulfilled?: ((value: unknown[]) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ) => Promise<unknown>;
};

function createMockDb(): DbChain {
  const chain = {} as DbChain;
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(drainSelect()));
  chain.insert = vi.fn(() => ({
    values: vi.fn(() => {
      const afterValues = {
        onConflictDoUpdate: vi.fn(() => Promise.resolve(undefined)),
        then(
          onfulfilled?: ((v: unknown) => unknown) | null,
          onrejected?: ((e: unknown) => unknown) | null
        ) {
          return Promise.resolve(undefined).then(onfulfilled, onrejected);
        },
      };
      return afterValues;
    }),
  }));
  chain.update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(undefined)),
    })),
  }));
  chain.delete = vi.fn(() => ({
    where: vi.fn(() => Promise.resolve(undefined)),
  }));
  chain.transaction = vi.fn((fn: (tx: DbChain) => unknown) => fn(chain));
  chain.then = (onfulfilled, onrejected) =>
    Promise.resolve(drainSelect()).then(onfulfilled, onrejected);
  return chain;
}

export const mockDb = createMockDb();

type MockUser = {
  userId: string;
  email: string;
  role?: "user" | "admin";
};

export function mockRequireAuth(userId = "user_test123", role: "user" | "admin" = "user") {
  return vi.fn(async (c: Context, next: () => Promise<void>) => {
    const h = c.req.header("Authorization") ?? "";
    if (!h.startsWith("Bearer ")) {
      return c.json(CommonErrors.unauthorized(), 401);
    }
    const u: MockUser = { userId, email: "test@example.com", role };
    c.set("user", {
      userId: u.userId,
      email: u.email,
      role: u.role ?? "user",
      clerk: { sub: u.userId },
    });
    await next();
  }) as unknown as MiddlewareHandler;
}

export function mockRequireAdmin(userId = "user_admin123") {
  return vi.fn(async (c: Context, next: () => Promise<void>) => {
    const h = c.req.header("Authorization") ?? "";
    if (!h.startsWith("Bearer ")) {
      return c.json(CommonErrors.unauthorized(), 401);
    }
    c.set("user", {
      userId,
      email: "admin@example.com",
      role: "admin",
      clerk: { sub: userId },
    });
    await next();
  }) as unknown as MiddlewareHandler;
}
