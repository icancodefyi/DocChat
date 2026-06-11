import { jest } from "@jest/globals";
import { mockAllExternal } from "../helpers/mockExternal.js";
mockAllExternal(jest);

const { app } = await import("../../app.js");
import supertest from "supertest";
import redis from "../../utils/redis.js";
import prisma from "../../utils/prismaClient.js";

const request = supertest(app);

const TEST_USER = {
  email: "testuser@example.com",
  fullname: "Test User",
  username: "testuser",
  password: "Password123!",
};

async function getVerificationCode(email) {
  const code = await redis.get(email);
  if (!code) throw new Error(`No verification code found in Redis for ${email}`);
  return Number(code);
}

async function cleanup() {
  await prisma.$executeRawUnsafe(`DELETE FROM "AuditEvent"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "UsageEvents"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "ChatMessageSource"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "ChatMessage"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "ApiKey"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Chat"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "User"`);
}

describe("Auth Integration — /api/v1/user", () => {
  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    redis.disconnect();
  });

  describe("Full auth flow", () => {
    let cookies;

    test("POST /send-verification-code — should send code", async () => {
      const res = await request
        .post("/api/v1/user/send-verification-code")
        .send({ email: TEST_USER.email });

      expect(res.status).toBe(200);
      expect(res.body.data.emailSent).toBe(true);
    });

    test("POST /verify-email — should verify email with code from Redis", async () => {
      const code = await getVerificationCode(TEST_USER.email);
      const res = await request
        .post("/api/v1/user/verify-email")
        .send({ email: TEST_USER.email, code });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/verified/i);
    });

    test("POST /register — should register user", async () => {
      const res = await request
        .post("/api/v1/user/register")
        .send({
          fullname: TEST_USER.fullname,
          username: TEST_USER.username,
          email: TEST_USER.email,
          password: TEST_USER.password,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.username).toBe(TEST_USER.username);
    });

    test("POST /login — should login with email + password", async () => {
      const res = await request
        .post("/api/v1/user/login")
        .send({ email: TEST_USER.email, password: TEST_USER.password });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();

      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      cookies = setCookie.join("; ");
    });

    test("POST /login — should login with username + password", async () => {
      const res = await request
        .post("/api/v1/user/login")
        .send({ username: TEST_USER.username, password: TEST_USER.password });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
    });

    test("GET /profile — should return current user when authenticated", async () => {
      const res = await request
        .get("/api/v1/user/profile")
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(TEST_USER.email);
      expect(res.body.data.username).toBe(TEST_USER.username);
    });

    test("GET /profile — should reject without auth", async () => {
      const res = await request.get("/api/v1/user/profile");
      expect(res.status).toBe(401);
    });

    test("GET /logout — should clear session", async () => {
      const res = await request
        .get("/api/v1/user/logout")
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
    });
  });

  describe("Validation errors", () => {
    test("POST /login — should reject missing credentials", async () => {
      const res = await request
        .post("/api/v1/user/login")
        .send({ password: "somepass" });

      expect(res.status).toBe(400);
    });

    test("POST /login — should reject wrong password", async () => {
      const res = await request
        .post("/api/v1/user/login")
        .send({ email: TEST_USER.email, password: "wrongpass" });

      expect(res.status).toBe(401);
    });

    test("POST /register — should reject missing fields", async () => {
      const res = await request
        .post("/api/v1/user/register")
        .send({ email: TEST_USER.email });

      expect(res.status).toBe(400);
    });

    test("POST /send-verification-code — should reject invalid email", async () => {
      const res = await request
        .post("/api/v1/user/send-verification-code")
        .send({ email: "not-an-email" });

      expect(res.status).toBe(400);
    });
  });
});
