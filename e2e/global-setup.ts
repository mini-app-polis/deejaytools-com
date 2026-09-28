import { clerkSetup } from "@clerk/testing/playwright";
import { e2eConfig } from "./env";

/** Validate the configuration, then fetch the Clerk testing token that lets
 * the browser past Clerk's bot protection. */
export default async function globalSetup(): Promise<void> {
  e2eConfig();
  await clerkSetup();
}
