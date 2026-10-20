import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

export const TEST_USER_ID = "test-user-owner";
export const TEST_USER_EMAIL = "owner@test.local";
export const TEST_USER_PASSWORD = "TestOwnerPass123!";

/** Removes every row the test suite creates. */
export async function resetTestDatabase() {
  await prisma.trip.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.user.deleteMany();
}

/** Creates the owner user plus its credential account. */
export async function seedTestUser(
  id: string = TEST_USER_ID,
  email: string = TEST_USER_EMAIL,
) {
  await prisma.user.create({
    data: {
      id,
      name: "Test Owner",
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(TEST_USER_PASSWORD),
        },
      },
    },
  });
}
