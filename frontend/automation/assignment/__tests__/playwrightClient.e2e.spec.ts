import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { PlaywrightAssignmentClient } from "../playwrightClient";
import type { AutomationConfig } from "../types";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureUrl = `file://${path.resolve(dirname, "../__fixtures__/assignment-screen.html")}`;

const config: AutomationConfig = {
  appUrl: fixtureUrl,
  headless: true,
  maxRetries: 1,
  artifactsDir: "artifacts/automation-test",
};

test("client enters a rate, confirms it, and the value is verifiable in the DOM", async ({ page }) => {
  const client = new PlaywrightAssignmentClient(config, page);
  await client.launch();
  await client.open();

  await client.findConsignment("CONSIG-A");
  await client.findLine("CONSIG-A", "LINE-1");
  await client.enterDutyRate("CONSIG-A", "LINE-1", 0.12);
  await client.confirmLine("CONSIG-A", "LINE-1");

  expect(await client.readDutyRate("CONSIG-A", "LINE-1")).toBe("0.12");
  expect(await client.readLineError("CONSIG-A", "LINE-1")).toBeNull();
});

test("client surfaces a UI validation error instead of swallowing it", async ({ page }) => {
  const client = new PlaywrightAssignmentClient(config, page);
  await client.launch();
  await client.open();

  await client.enterDutyRate("CONSIG-A", "LINE-3", -5);
  await client.confirmLine("CONSIG-A", "LINE-3");

  expect(await client.readLineError("CONSIG-A", "LINE-3")).toBe(
    "Rate must be greater than or equal to 0",
  );
});

test("client reports a missing consignment rather than editing the wrong row", async ({ page }) => {
  const client = new PlaywrightAssignmentClient(config, page);
  await client.launch();
  await client.open();

  await expect(client.findConsignment("CONSIG-DOES-NOT-EXIST")).rejects.toThrow(
    "Consignment not found",
  );
});
