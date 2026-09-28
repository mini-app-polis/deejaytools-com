import { clerk } from "@clerk/testing/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { ClerkTestSession } from "../src/contract/clerk";
import { e2eConfig } from "./env";

/**
 * Talks to the dev API as the test user, to set up and tear down what a test
 * needs. Deliberately not the app's endpoint catalog: that module pulls in
 * the browser build's Sentry setup, which only runs under Vite.
 */
export class Api {
  private constructor(
    private readonly apiUrl: string,
    readonly session: ClerkTestSession
  ) {}

  static async start(): Promise<Api> {
    const cfg = e2eConfig();
    return new Api(cfg.apiUrl, await ClerkTestSession.start(cfg.secretKey, cfg.userId));
  }

  async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.session.token()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
    return (text ? (JSON.parse(text) as { data: T }).data : undefined) as T;
  }

  async end(): Promise<void> {
    await this.session.end();
  }
}

/** Sign the test user in through Clerk (a Backend-API sign-in token: no
 * password, no verification step), landing on the home page. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
}

/** A short id that makes this run's data recognisable and unique. */
export const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

export const test = base;
export { expect };
