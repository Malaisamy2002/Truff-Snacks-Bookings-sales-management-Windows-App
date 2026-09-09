import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "./settings";

describe("normalizeAppSettings()", () => {
  it("restores missing lists and malformed values before Settings renders", () => {
    const settings = normalizeAppSettings({
      gstRate: "not-a-number",
      customTaxes: null,
      backupReminder: "monthly",
      billPrefix: " ",
      billStartNo: 0,
    });

    expect(settings.gstRate).toBe(DEFAULT_APP_SETTINGS.gstRate);
    expect(settings.customTaxes).toEqual([]);
    expect(settings.backupReminder).toBe("off");
    expect(settings.billPrefix).toBe("INV-");
    expect(settings.billStartNo).toBe(1);
  });
});
