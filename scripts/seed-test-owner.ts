import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

/**
 * Seeds the owner account for the automated test suites.
 *
 * It wipes every row the tests own and recreates a single owner with the
 * credentials from OWNER_EMAIL / OWNER_PASSWORD. It refuses to run unless the
 * target database name ends with "_test", so it can never touch real data.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/(_test|test_)/.test(new URL(databaseUrl).pathname)) {
    console.error(
      "Refusing to seed: DATABASE_URL does not point at a test database.",
    );
    process.exit(1);
  }

  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) {
    console.error("OWNER_EMAIL and OWNER_PASSWORD must be set.");
    process.exit(1);
  }

  await prisma.trip.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.user.deleteMany();

  const userId = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      name: "Owner",
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });

  console.log(`Seeded test owner ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
