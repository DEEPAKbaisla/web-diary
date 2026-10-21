import { expect, test } from "@playwright/test";
import { login, settle } from "./helpers";

const TRIP_DATE = "2026-03-15";
const DUPLICATE_TRIP_DATE = "2026-04-20";

test.describe("trip diary", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("adds a trip and lists it with the correct count and total fare", async ({
    page,
  }) => {
    await page.getByRole("link", { name: "+ Naya Trip" }).click();
    await expect(page).toHaveURL(/\/trips\/new/);

    await page.getByLabel("Date").fill(TRIP_DATE);
    await page.getByLabel("Kahan se").fill("Connaught Place");
    await page.getByLabel("Kahan tak").fill("India Gate");
    await page.getByLabel("Kiraya (₹)").fill("250");
    await page.getByLabel("Customer ka Naam").fill("Ramesh Kumar");
    await page.getByLabel("Mobile Number").fill("9876543210");

    await page.getByRole("button", { name: "Trip Save Karein" }).click();
    await expect(page.getByText("Trip save ho gayi!")).toBeVisible();

    await page.goto("/trips");
    await settle(page);
    await page.getByLabel("Date").fill(TRIP_DATE);
    await page.getByRole("button", { name: "Dikhao" }).click();

    await expect(page.getByText("Connaught Place")).toBeVisible();
    await expect(page.getByText("India Gate")).toBeVisible();
    await expect(page.getByText("Ramesh Kumar")).toBeVisible();
    await expect(page.getByText("9876543210")).toBeVisible();
    await expect(page.getByText(/1 trip/)).toBeVisible();
    await expect(page.getByText(/Total kiraya:/)).toContainText("₹250");
  });

  test("adds several trips for the same date and sums the fares", async ({
    page,
  }) => {
    for (const trip of [
      { from: "Airport", to: "Hotel", fare: "900", name: "One" },
      { from: "Mall", to: "Station", fare: "150", name: "Two" },
    ]) {
      await page.goto("/trips/new");
      await settle(page);
      await page.getByLabel("Date").fill(TRIP_DATE);
      await page.getByLabel("Kahan se").fill(trip.from);
      await page.getByLabel("Kahan tak").fill(trip.to);
      await page.getByLabel("Kiraya (₹)").fill(trip.fare);
      await page.getByLabel("Customer ka Naam").fill(trip.name);
      await page.getByLabel("Mobile Number").fill("9876543210");
      await page.getByRole("button", { name: "Trip Save Karein" }).click();
      await expect(page.getByText("Trip save ho gayi!")).toBeVisible();
    }

    await page.goto("/trips");
    await settle(page);
    await page.getByLabel("Date").fill(TRIP_DATE);
    await page.getByRole("button", { name: "Dikhao" }).click();

    await expect(page.getByText(/3 trip/)).toBeVisible();
    await expect(page.getByText(/Total kiraya:/)).toContainText("₹1,300");
  });

  test("shows a friendly empty state for a date without trips", async ({
    page,
  }) => {
    await page.goto("/trips");
    await settle(page);
    await page.getByLabel("Date").fill("2026-01-01");
    await page.getByRole("button", { name: "Dikhao" }).click();

    await expect(
      page.getByText("Is date ki koi trip nahi mili."),
    ).toBeVisible();
  });

  test("shows client-side validation errors and does not save the trip", async ({
    page,
  }) => {
    await page.goto("/trips/new");
    await settle(page);
    await page.getByLabel("Kahan se").fill("A");
    await page.getByLabel("Kahan tak").fill("B");
    await page.getByLabel("Kiraya (₹)").fill("-5");
    await page.getByLabel("Customer ka Naam").fill("X");
    await page.getByLabel("Mobile Number").fill("12345");
    await page.getByRole("button", { name: "Trip Save Karein" }).click();

    await expect(page.getByText("Kiraya 0 ya usse zyada hona chahiye")).toBeVisible();
    await expect(
      page.getByText("Sahi Indian mobile number daaliye (10 digits)"),
    ).toBeVisible();
  });

  test("does not create a duplicate trip when Save is clicked twice", async ({
    page,
  }) => {
    let createRequests = 0;
    await page.route("**/api/trips", async (route) => {
      if (route.request().method() === "POST") {
        createRequests += 1;
        // Slow the response down so the second click lands while the first
        // request is still in flight.
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });

    await page.goto("/trips/new");
    await settle(page);
    await page.getByLabel("Date").fill(DUPLICATE_TRIP_DATE);
    await page.getByLabel("Kahan se").fill("Duplicate Test");
    await page.getByLabel("Kahan tak").fill("Nowhere");
    await page.getByLabel("Kiraya (₹)").fill("100");
    await page.getByLabel("Customer ka Naam").fill("Double Click");
    await page.getByLabel("Mobile Number").fill("9876543210");

    // Selected by type so the locator keeps matching while the button label
    // changes to "Saving...".
    const save = page.locator('button[type="submit"]');
    await save.click();
    await save.click({ force: true, timeout: 2000 }).catch(() => {});

    await expect(page.getByText("Trip save ho gayi!")).toBeVisible();
    expect(createRequests).toBe(1);

    await page.goto("/trips");
    await settle(page);
    await page.getByLabel("Date").fill(DUPLICATE_TRIP_DATE);
    await page.getByRole("button", { name: "Dikhao" }).click();
    await expect(page.getByText(/1 trip/)).toBeVisible();
  });
});
