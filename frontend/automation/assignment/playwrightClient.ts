import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { ConsignmentNotFoundError, LineNotFoundError } from "./errors";
import type { AssignmentClient, AutomationConfig } from "./types";

/** Drives the review screen built for Step 3 via its `data-testid` selectors. */
export class PlaywrightAssignmentClient implements AssignmentClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null;
  //: When a page is injected (tests), this client never owns/closes the browser lifecycle.
  private readonly ownsBrowser: boolean;

  constructor(
    private readonly config: AutomationConfig,
    existingPage?: Page,
  ) {
    this.page = existingPage ?? null;
    this.ownsBrowser = existingPage === undefined;
  }

  async launch(): Promise<void> {
    if (!this.ownsBrowser) return;
    this.browser = await chromium.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    if (this.config.username && this.config.password) {
      await this.login(this.config.username, this.config.password);
    }
  }

  private async login(username: string, password: string): Promise<void> {
    // The starter app ships with no auth; this only fires if credentials are configured,
    // reusing whatever login form a future deployment adds at appUrl.
    const page = this.requirePage();
    await page.goto(this.config.appUrl);
    const loginForm = page.getByTestId("login-form");
    if ((await loginForm.count()) === 0) return;
    await page.getByTestId("login-username").fill(username);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();
  }

  async open(): Promise<void> {
    const page = this.requirePage();
    await page.goto(this.config.appUrl, { waitUntil: "domcontentloaded" });
  }

  async findConsignment(consignmentReference: string): Promise<void> {
    const page = this.requirePage();
    const locator = page.getByTestId(`consignment-${consignmentReference}`);
    if ((await locator.count()) === 0) {
      throw new ConsignmentNotFoundError(consignmentReference);
    }
    await locator.first().scrollIntoViewIfNeeded();
  }

  async findLine(consignmentReference: string, lineReference: string): Promise<void> {
    await this.findConsignment(consignmentReference);
    const consignment = this.requirePage().getByTestId(`consignment-${consignmentReference}`);
    const locator = consignment.getByTestId(`assignment-line-${lineReference}`);
    if ((await locator.count()) === 0) {
      throw new LineNotFoundError(consignmentReference, lineReference);
    }
  }

  async readDutyRate(consignmentReference: string, lineReference: string): Promise<string> {
    await this.findLine(consignmentReference, lineReference);
    return this.requirePage().getByTestId(`duty-rate-input-${lineReference}`).inputValue();
  }

  async enterDutyRate(consignmentReference: string, lineReference: string, value: number): Promise<void> {
    await this.findLine(consignmentReference, lineReference);
    const input = this.requirePage().getByTestId(`duty-rate-input-${lineReference}`);
    await input.fill(String(value));
    await input.dispatchEvent("change");
  }

  async confirmLine(consignmentReference: string, lineReference: string): Promise<void> {
    await this.findLine(consignmentReference, lineReference);
    await this.requirePage().getByTestId(`confirm-line-${lineReference}`).click();
  }

  async readLineError(consignmentReference: string, lineReference: string): Promise<string | null> {
    await this.findLine(consignmentReference, lineReference);
    const errorEl = this.requirePage().getByTestId(`line-error-${lineReference}`);
    if ((await errorEl.count()) === 0) return null;
    const text = await errorEl.first().textContent();
    return text?.trim() || null;
  }

  async captureDiagnostics(name: string): Promise<{ screenshotPath: string | null; url: string }> {
    const page = this.requirePage();
    const url = page.url();
    fs.mkdirSync(this.config.artifactsDir, { recursive: true });
    const screenshotPath = path.join(this.config.artifactsDir, `${name}.png`);
    try {
      await page.screenshot({ path: screenshotPath });
      return { screenshotPath, url };
    } catch {
      return { screenshotPath: null, url };
    }
  }

  async close(): Promise<void> {
    if (!this.ownsBrowser) return;
    await this.context?.close();
    await this.browser?.close();
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("PlaywrightAssignmentClient.launch() must be called first.");
    return this.page;
  }
}
