import { test, expect } from "@playwright/test";
import { runAssignmentAutomation } from "../assignmentAdapter";
import type { AutomationConfig, AssignmentInput } from "../types";
import { FakeAssignmentClient } from "./fakeAssignmentClient";

const baseConfig: AutomationConfig = {
  appUrl: "http://localhost:5173",
  headless: true,
  maxRetries: 3,
  artifactsDir: "artifacts/automation-test",
};

test("successful assignment: high-confidence line is entered and confirmed", async () => {
  const client = new FakeAssignmentClient({
    consignments: { "CONSIG-A": { "LINE-1": { dutyRate: "" } } },
  });
  const input: AssignmentInput[] = [
    {
      consignmentReference: "CONSIG-A",
      lines: [
        {
          lineReference: "LINE-1",
          description: "Plastic frames",
          origin: "CN",
          commodityCode: "9003110000",
          rate: 0.12,
          confidence: 0.9,
        },
      ],
    },
  ];

  const result = await runAssignmentAutomation(input, baseConfig, client);

  expect(result).toMatchObject({ processed: 1, successful: 1, failed: 0, pending: 0 });
  expect(result.results[0]).toMatchObject({ status: "success", lineReference: "LINE-1" });
  expect(client.enterCalls).toEqual(["CONSIG-A:LINE-1"]);
});

test("low confidence: rate is not entered and line is reported pending", async () => {
  const client = new FakeAssignmentClient({
    consignments: { "CONSIG-A": { "LINE-1": { dutyRate: "" } } },
  });
  const input: AssignmentInput[] = [
    {
      consignmentReference: "CONSIG-A",
      lines: [
        {
          lineReference: "LINE-1",
          description: "Unknown item",
          origin: null,
          commodityCode: null,
          rate: 0.0,
          confidence: 0.2,
        },
      ],
    },
  ];

  const result = await runAssignmentAutomation(input, baseConfig, client);

  expect(result).toMatchObject({ processed: 1, successful: 0, failed: 0, pending: 1 });
  expect(client.enterCalls).toEqual([]);
  expect(client.confirmCalls).toEqual([]);
});

test("validation failure: UI rejection is captured and reported, not swallowed", async () => {
  const client = new FakeAssignmentClient({
    consignments: {
      "CONSIG-A": { "LINE-1": { dutyRate: "", rejectValue: -5 } },
    },
  });
  const input: AssignmentInput[] = [
    {
      consignmentReference: "CONSIG-A",
      lines: [
        {
          lineReference: "LINE-1",
          description: "Bad rate line",
          origin: "CN",
          commodityCode: "9003190090",
          rate: null,
          confidence: 0.9,
          finalRate: -5,
        },
      ],
    },
  ];

  const result = await runAssignmentAutomation(input, baseConfig, client);

  expect(result).toMatchObject({ processed: 1, successful: 0, failed: 1, pending: 0 });
  expect(result.results[0].status).toBe("failed");
  expect(result.results[0].error).toContain("Rate must be greater than or equal to 0");
});

test("missing consignment: failure is reported and the next consignment still runs", async () => {
  const client = new FakeAssignmentClient({
    consignments: { "CONSIG-B": { "LINE-1": { dutyRate: "" } } },
  });
  const input: AssignmentInput[] = [
    {
      consignmentReference: "CONSIG-MISSING",
      lines: [
        { lineReference: "LINE-1", description: "x", origin: null, commodityCode: null, rate: 0.1, confidence: 0.9 },
      ],
    },
    {
      consignmentReference: "CONSIG-B",
      lines: [
        { lineReference: "LINE-1", description: "y", origin: null, commodityCode: null, rate: 0.2, confidence: 0.9 },
      ],
    },
  ];

  const result = await runAssignmentAutomation(input, baseConfig, client);

  expect(result.processed).toBe(2);
  expect(result.results[0]).toMatchObject({ consignmentReference: "CONSIG-MISSING", status: "failed" });
  expect(result.results[0].error).toContain("Consignment not found");
  expect(result.results[1]).toMatchObject({ consignmentReference: "CONSIG-B", status: "success" });
});

test("retry: a transient failure is retried and eventually succeeds", async () => {
  const client = new FakeAssignmentClient({
    consignments: { "CONSIG-A": { "LINE-1": { dutyRate: "" } } },
    transientFailuresBeforeSuccess: { "CONSIG-A:LINE-1": 2 },
  });
  const input: AssignmentInput[] = [
    {
      consignmentReference: "CONSIG-A",
      lines: [
        { lineReference: "LINE-1", description: "x", origin: null, commodityCode: null, rate: 0.15, confidence: 0.9 },
      ],
    },
  ];

  const result = await runAssignmentAutomation(input, { ...baseConfig, maxRetries: 3 }, client);

  expect(result).toMatchObject({ successful: 1, failed: 0, pending: 0 });
});

test("idempotency: a line already at the intended value is not re-entered", async () => {
  const client = new FakeAssignmentClient({
    consignments: { "CONSIG-A": { "LINE-1": { dutyRate: "0.12" } } },
  });
  const input: AssignmentInput[] = [
    {
      consignmentReference: "CONSIG-A",
      lines: [
        { lineReference: "LINE-1", description: "x", origin: null, commodityCode: null, rate: 0.12, confidence: 0.9 },
      ],
    },
  ];

  const result = await runAssignmentAutomation(input, baseConfig, client);

  expect(result).toMatchObject({ successful: 1, failed: 0 });
  expect(client.enterCalls).toEqual([]);
  expect(client.confirmCalls).toEqual([]);
});

test("multiple consignments: one failure does not affect independent successes", async () => {
  const client = new FakeAssignmentClient({
    consignments: {
      "CONSIG-A": { "LINE-1": { dutyRate: "" } },
      "CONSIG-C": { "LINE-1": { dutyRate: "" } },
    },
  });
  const input: AssignmentInput[] = [
    {
      consignmentReference: "CONSIG-A",
      lines: [{ lineReference: "LINE-1", description: "a", origin: null, commodityCode: null, rate: 0.1, confidence: 0.9 }],
    },
    {
      consignmentReference: "CONSIG-B-MISSING",
      lines: [{ lineReference: "LINE-1", description: "b", origin: null, commodityCode: null, rate: 0.2, confidence: 0.9 }],
    },
    {
      consignmentReference: "CONSIG-C",
      lines: [{ lineReference: "LINE-1", description: "c", origin: null, commodityCode: null, rate: 0.3, confidence: 0.9 }],
    },
  ];

  const result = await runAssignmentAutomation(input, baseConfig, client);

  expect(result).toMatchObject({ processed: 3, successful: 2, failed: 1, pending: 0 });
  expect(result.results.find((r) => r.consignmentReference === "CONSIG-A")?.status).toBe("success");
  expect(result.results.find((r) => r.consignmentReference === "CONSIG-B-MISSING")?.status).toBe("failed");
  expect(result.results.find((r) => r.consignmentReference === "CONSIG-C")?.status).toBe("success");
});
