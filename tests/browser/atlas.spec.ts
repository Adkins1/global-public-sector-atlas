import { test, expect } from "@playwright/test";
test("Polish map, year selection, lineage, comparisons and download", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/pl/");
  await expect(page.locator(".country-panel .big-value")).toContainText("16,7");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Źródło i metodologia wartości" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("OECD");
  await expect(page.getByRole("dialog")).toContainText("2023");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Rok porównania").selectOption("2019");
  await expect(page.locator(".value-caption")).toContainText("2019");
  await page.getByLabel("Szukaj państwa").fill("Dania");
  await page
    .locator(".search-results")
    .getByRole("button", { name: "Dania", exact: true })
    .click();
  await expect(page.locator(".chips")).toContainText("Dania");
  await expect(page).toHaveURL(/DNK/);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toContain("2019.csv");
  expect(errors).toEqual([]);
});
test("missing remains missing; WWBI disables ranking; source for derived inputs", async ({
  page,
}) => {
  await page.goto("/en/");
  await expect(page.locator(".country-panel .big-value")).toContainText("16.7");
  await page.getByLabel("Selected country").selectOption("CHN");
  await expect(page.locator(".country-panel .big-value")).toContainText("—");
  await page
    .locator(".metric-control select")
    .selectOption("public_employment_share");
  await expect(page.locator(".warning")).toContainText("no ranking");
  await page
    .locator(".metric-control select")
    .selectOption("government_per_1000");
  await page.getByLabel("Selected country").selectOption("POL");
  await page.getByRole("button", { name: "Source and methodology" }).click();
  await expect(page.getByRole("dialog")).toContainText("Input observations");
  await expect(page.getByRole("dialog")).toContainText(
    "POL:2023:population:TOTAL",
  );
});
test("mobile fits viewport and static pages work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pl/");
  await expect(page.locator(".country-panel .big-value")).toContainText("16,7");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-map-ready",
    "true",
  );
  await page.screenshot({
    path: "test-results/atlas-mobile.png",
    fullPage: true,
  });
  await page.goto("/en/country/pol/");
  await expect(page.locator("h1")).toHaveText("Poland");
  await expect(page.locator("tbody")).toContainText("16.68");
  await page.goto("/pl/methodology/");
  await expect(page.locator("h1")).toContainText("definicja");
});
test("desktop screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/pl/");
  await expect(page.locator(".country-panel .big-value")).toContainText("16,7");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".world-map")).toHaveAttribute(
    "data-map-ready",
    "true",
  );
  await page.screenshot({
    path: "test-results/atlas-desktop.png",
    fullPage: true,
  });
});
