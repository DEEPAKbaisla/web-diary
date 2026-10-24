import { expect, test } from "@playwright/test";
import { login, settle } from "./helpers";

const TRIP_DATE = "2026-03-15";
const DUPLICATE_TRIP_DATE = "2026-04-20";
const KHARCH_TRIP_DATE = "2026-05-05";
const PHONE_TRIP_DATE = "2026-06-10";
const EDIT_TRIP_DATE = "2026-07-14";
const CANCEL_TRIP_DATE = "2026-08-18";

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

  test("saves the kharch of a trip", async ({ page }) => {
    await page.goto("/trips/new");
    await settle(page);
    await page.getByLabel("Date").fill(KHARCH_TRIP_DATE);
    await page.getByLabel("Kahan se").fill("Kharch Test");
    await page.getByLabel("Kahan tak").fill("To");
    await page.getByLabel("Kiraya (₹)").fill("300");
    await page.getByLabel("Kharch (₹)").fill("75");
    await page.getByLabel("Customer ka Naam").fill("Kharch Test");
    await page.getByLabel("Mobile Number").fill("9876543210");
    await page.getByRole("button", { name: "Trip Save Karein" }).click();
    await expect(page.getByText("Trip save ho gayi!")).toBeVisible();

    const response = await page.request.get(
      `/api/trips?date=${KHARCH_TRIP_DATE}`,
    );
    const body = await response.json();
    const trip = body.data.trips.find(
      (item: { customerName: string }) => item.customerName === "Kharch Test",
    );
    expect(trip.kharch).toBe(75);
  });

  test("leaves the kharch at zero when the box is empty", async ({ page }) => {
    await page.goto("/trips/new");
    await settle(page);
    await page.getByLabel("Date").fill(KHARCH_TRIP_DATE);
    await page.getByLabel("Kahan se").fill("No Kharch Test");
    await page.getByLabel("Kahan tak").fill("To");
    await page.getByLabel("Kiraya (₹)").fill("200");
    await page.getByLabel("Customer ka Naam").fill("No Kharch Test");
    await page.getByLabel("Mobile Number").fill("9876543210");
    await page.getByRole("button", { name: "Trip Save Karein" }).click();
    await expect(page.getByText("Trip save ho gayi!")).toBeVisible();

    const response = await page.request.get(
      `/api/trips?date=${KHARCH_TRIP_DATE}`,
    );
    const body = await response.json();
    const trip = body.data.trips.find(
      (item: { customerName: string }) =>
        item.customerName === "No Kharch Test",
    );
    expect(trip.kharch).toBe(0);
  });

  test("saves several phone numbers on one trip", async ({ page }) => {
    await page.goto("/trips/new");
    await settle(page);
    await page.getByLabel("Date").fill(PHONE_TRIP_DATE);
    await page.getByLabel("Kahan se").fill("Multi Phone Test");
    await page.getByLabel("Kahan tak").fill("To");
    await page.getByLabel("Kiraya (₹)").fill("180");
    await page.getByLabel("Customer ka Naam").fill("Two Riders");
    await page
      .getByLabel("Mobile Number")
      .fill("9876543210, +91 98123 45678");
    await page.getByRole("button", { name: "Trip Save Karein" }).click();
    await expect(page.getByText("Trip save ho gayi!")).toBeVisible();

    await page.goto("/trips");
    await settle(page);
    await page.getByLabel("Date").fill(PHONE_TRIP_DATE);
    await page.getByRole("button", { name: "Dikhao" }).click();

    // Both numbers are shown, as their own links.
    await expect(
      page.getByRole("link", { name: "9876543210" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "9812345678" }),
    ).toBeVisible();
  });

  test("edits a trip in place and updates the day totals", async ({ page }) => {
    await page.goto("/trips/new");
    await settle(page);
    await page.getByLabel("Date").fill(EDIT_TRIP_DATE);
    await page.getByLabel("Kahan se").fill("Old Origin");
    await page.getByLabel("Kahan tak").fill("Old Destination");
    await page.getByLabel("Kiraya (₹)").fill("250");
    await page.getByLabel("Customer ka Naam").fill("Edit Test");
    await page.getByLabel("Mobile Number").fill("9876543210");
    await page.getByRole("button", { name: "Trip Save Karein" }).click();
    await expect(page.getByText("Trip save ho gayi!")).toBeVisible();

    await page.goto("/trips");
    await settle(page);
    await page.getByLabel("Date").fill(EDIT_TRIP_DATE);
    await page.getByRole("button", { name: "Dikhao" }).click();
    await expect(page.getByText(/Total kiraya:/)).toContainText("₹250");

    // The row becomes an editor for that same trip.
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Kahan se").fill("New Origin");
    await page.getByLabel("Kiraya (₹)").fill("400");
    await page.getByRole("button", { name: "Badlaav Save Karein" }).click();

    await expect(page.getByText("New Origin")).toBeVisible();
    await expect(page.getByText("Old Origin")).toHaveCount(0);
    // The editor closes and the totals follow the edit.
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(1);
    await expect(page.getByText(/Total kiraya:/)).toContainText("₹400");
  });

  test("cancelling an edit leaves the trip alone", async ({ page }) => {
    await page.goto("/trips/new");
    await settle(page);
    await page.getByLabel("Date").fill(CANCEL_TRIP_DATE);
    await page.getByLabel("Kahan se").fill("Cancel Test");
    await page.getByLabel("Kahan tak").fill("To");
    await page.getByLabel("Kiraya (₹)").fill("120");
    await page.getByLabel("Customer ka Naam").fill("Cancel Test");
    await page.getByLabel("Mobile Number").fill("9876543210");
    await page.getByRole("button", { name: "Trip Save Karein" }).click();
    await expect(page.getByText("Trip save ho gayi!")).toBeVisible();

    await page.goto("/trips");
    await settle(page);
    await page.getByLabel("Date").fill(CANCEL_TRIP_DATE);
    await page.getByRole("button", { name: "Dikhao" }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Kahan se").fill("Should Not Be Saved");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("Cancel Test").first()).toBeVisible();
    await expect(page.getByText("Should Not Be Saved")).toHaveCount(0);
    await expect(page.getByText(/Total kiraya:/)).toContainText("₹120");
  });
});
