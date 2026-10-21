import { expect, test, type Page } from "@playwright/test";
import { login, settle } from "./helpers";
import { formatDay } from "../../src/lib/format";
import { formatMonthLabel, shiftMonth } from "../../src/lib/validations";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function dayOf(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Creates a trip through the real API using the browser's session cookie. */
async function createTrip(
  page: Page,
  trip: {
    tripDate: string;
    fromLocation: string;
    toLocation: string;
    fare: number;
    customerName: string;
    customerPhone: string;
  },
) {
  const status = await page.evaluate(async (body) => {
    const response = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.status;
  }, trip);

  expect(status).toBe(201);
}

test("redirects an unauthenticated visitor to the login page", async ({
  page,
}) => {
  await page.goto("/trips/monthly");
  await settle(page);
  await expect(page).toHaveURL(/\/login/);
});

test.describe("monthly report", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows the current month grouped by day with the right totals", async ({
    page,
  }) => {
    const month = currentMonth();
    const firstDay = dayOf(month, 10);
    const secondDay = dayOf(month, 12);

    await createTrip(page, {
      tripDate: firstDay,
      fromLocation: "Airport",
      toLocation: "Hotel",
      fare: 250,
      customerName: "Monthly Test",
      customerPhone: "9876543210",
    });
    await createTrip(page, {
      tripDate: firstDay,
      fromLocation: "Mall",
      toLocation: "Station",
      fare: 100,
      customerName: "Monthly Test",
      customerPhone: "9876543210",
    });
    await createTrip(page, {
      tripDate: secondDay,
      fromLocation: "Airport",
      toLocation: "Hotel",
      fare: 77,
      customerName: "Monthly Test",
      customerPhone: "9876543210",
    });

    await page.goto("/trips/monthly");
    await settle(page);

    await expect(
      page.getByRole("heading", { name: "Mahine ka Hisaab" }),
    ).toBeVisible();
    await expect(page.getByText(formatMonthLabel(month)).first()).toBeVisible();
    await expect(page.getByText("Monthly Test").first()).toBeVisible();

    // Each day is its own group with that day's count and fare.
    await expect(page.getByText(/2 trips · ₹350/)).toBeVisible();
    await expect(page.getByText(/1 trip · ₹77/)).toBeVisible();

    // The headline total agrees with the API.
    const apiResponse = await page.request.get(`/api/trips?month=${month}`);
    const apiBody = await apiResponse.json();
    expect(apiBody.data.count).toBeGreaterThan(0);
    await expect(page.getByText(/Total kiraya:/)).toContainText(
      `₹${apiBody.data.totalFare.toLocaleString("en-IN")}`,
    );
  });

  test("moves between months with the arrow buttons", async ({ page }) => {
    const month = currentMonth();
    await createTrip(page, {
      tripDate: dayOf(month, 10),
      fromLocation: "Arrow Test",
      toLocation: "To",
      fare: 55,
      customerName: "Arrow Test",
      customerPhone: "9876543210",
    });

    await page.goto("/trips/monthly");
    await settle(page);
    await expect(page.getByText(formatMonthLabel(month)).first()).toBeVisible();
    await expect(page.getByText("Arrow Test").first()).toBeVisible();

    // Back one month.
    await page.getByRole("button", { name: "Pichhla mahina" }).click();
    await expect(
      page.getByText(formatMonthLabel(shiftMonth(month, -1))).first(),
    ).toBeVisible();
    await expect(page.getByText("Arrow Test")).toHaveCount(0);
    await expect(
      page.getByText("Is mahine ki koi trip nahi mili."),
    ).toBeVisible();

    // Forward one month, back to where we started.
    await page.getByRole("button", { name: "Agla mahina" }).click();
    await expect(page.getByText(formatMonthLabel(month)).first()).toBeVisible();
    await expect(page.getByText("Arrow Test").first()).toBeVisible();
  });

  test("jumps back to the current month", async ({ page }) => {
    const month = currentMonth();

    await page.goto("/trips/monthly");
    await settle(page);
    await page.getByRole("button", { name: "Pichhla mahina" }).click();
    await expect(
      page.getByText(formatMonthLabel(shiftMonth(month, -1))).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Is mahine" }).click();
    await expect(page.getByText(formatMonthLabel(month)).first()).toBeVisible();
  });

  test("opens a day in the diary view", async ({ page }) => {
    const month = currentMonth();
    const day = dayOf(month, 14);

    await createTrip(page, {
      tripDate: day,
      fromLocation: "Link Test",
      toLocation: "To",
      fare: 321,
      customerName: "Link Test",
      customerPhone: "9876543210",
    });

    await page.goto("/trips/monthly");
    await settle(page);
    await page.getByRole("link", { name: formatDay(day) }).click();

    await expect(page).toHaveURL(new RegExp(`/trips\\?date=${day}`));
    await expect(page.getByLabel("Date")).toHaveValue(day);
    await expect(page.getByText("Link Test").first()).toBeVisible();
  });

  test("is reachable from the diary tab", async ({ page }) => {
    await page.goto("/trips");
    await settle(page);
    await page.getByRole("link", { name: "Monthly", exact: true }).click();
    await expect(page).toHaveURL(/\/trips\/monthly/);
    await expect(
      page.getByRole("heading", { name: "Mahine ka Hisaab" }),
    ).toBeVisible();
  });
});
