const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

let puppeteer = null;
try {
  puppeteer = require("puppeteer");
} catch (err) {
  // Optional. If it is not installed, we can use a system Chromium executable instead.
}

const COMMON_CHROMIUM_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/opt/google/chrome/chrome",
];

class StarberryCaptureService {
  constructor({ timeoutMs = 15000, cacheMinutes = 10 } = {}) {
    this.timeoutMs = timeoutMs;
    this.cacheMs = cacheMinutes * 60 * 1000;
    this.browser = null;
    this.cache = new Map();
  }

  getChromiumExecutable() {
    const configured = process.env.CHROMIUM_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (configured && fs.existsSync(configured)) return configured;
    return COMMON_CHROMIUM_PATHS.find(candidate => fs.existsSync(candidate)) || null;
  }

  async getBrowser() {
    if (! puppeteer) return null;
    if (this.browser && this.browser.connected) return this.browser;

    const launchOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    };

    const configuredExecutable = this.getChromiumExecutable();
    if (configuredExecutable) launchOptions.executablePath = configuredExecutable;

    this.browser = await puppeteer.launch(launchOptions);
    return this.browser;
  }

  getCached(key) {
    const hit = this.cache.get(key);
    if (! hit) return null;
    if (Date.now() - hit.createdAt > this.cacheMs) {
      this.cache.delete(key);
      return null;
    }
    return hit.buffer;
  }

  async screenshotWithPuppeteer(url) {
    const browser = await this.getBrowser();
    if (! browser) return null;

    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1.5 });
      await page.goto(url, { waitUntil: "networkidle0", timeout: this.timeoutMs });
      await page.waitForSelector('body[data-capture-ready="true"]', { timeout: this.timeoutMs });
      const card = await page.waitForSelector("#discord-capture-card", {
        visible: true,
        timeout: this.timeoutMs,
      });
      return card.screenshot({ type: "png" });
    } finally {
      await page.close().catch(() => {});
    }
  }

  async screenshotWithChromium(url) {
    const executable = this.getChromiumExecutable();
    if (! executable) {
      throw new Error("No Chromium executable was found. Set CHROMIUM_EXECUTABLE_PATH to enable image cards.");
    }

    const filename = `starberry-${crypto.randomUUID()}.png`;
    const outputPath = path.join(os.tmpdir(), filename);
    const args = [
      "--headless=new",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=900,1100",
      "--virtual-time-budget=5000",
      `--screenshot=${outputPath}`,
      url,
    ];

    try {
      await new Promise((resolve, reject) => {
        execFile(executable, args, { timeout: this.timeoutMs + 5000 }, (err, stdout, stderr) => {
          if (err) {
            err.message = `${err.message}${stderr ? `\n${stderr}` : ""}`;
            reject(err);
            return;
          }
          resolve(stdout);
        });
      });
      return await fs.promises.readFile(outputPath);
    } finally {
      await fs.promises.unlink(outputPath).catch(() => {});
    }
  }

  async screenshot(url) {
    const cached = this.getCached(url);
    if (cached) return cached;

    let buffer;
    if (puppeteer) {
      try {
        buffer = await this.screenshotWithPuppeteer(url);
      } catch (err) {
        if (! this.browser || ! this.browser.connected) this.browser = null;
        const executable = this.getChromiumExecutable();
        if (! executable) throw err;
        buffer = await this.screenshotWithChromium(url);
      }
    } else {
      buffer = await this.screenshotWithChromium(url);
    }

    this.cache.set(url, { createdAt: Date.now(), buffer });
    return buffer;
  }

  async close() {
    if (! this.browser) return;
    await this.browser.close().catch(() => {});
    this.browser = null;
  }
}

module.exports = { StarberryCaptureService };
