import { jest } from "@jest/globals";
import { mockAllExternal } from "../helpers/mockExternal.js";
mockAllExternal(jest);

const { app } = await import("../../app.js");
import supertest from "supertest";
import prisma from "../../utils/prismaClient.js";

const request = supertest(app);

const USER_A = {
  email: "chata@example.com",
  fullname: "Chat User A",
  username: "chatusera",
  password: "Password123!",
};

const USER_B = {
  email: "chatb@example.com",
  fullname: "Chat User B",
  username: "chatuserb",
  password: "Password123!",
};

let cookiesA;
let cookiesB;
let chatId;

async function createUserAndLogin(user) {
  await request.post("/api/v1/user/send-verification-code").send({ email: user.email });
  const codeA = await (await import("../../utils/redis.js")).default.get(user.email);
  await request.post("/api/v1/user/verify-email").send({ email: user.email, code: Number(codeA) });
  await request.post("/api/v1/user/register").send(user);
  const loginRes = await request.post("/api/v1/user/login").send({ email: user.email, password: user.password });
  return loginRes.headers["set-cookie"].join("; ");
}

async function cleanup() {
  await prisma.$executeRawUnsafe(`DELETE FROM "AuditEvent"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "UsageEvents"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "ChatMessageSource"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "ChatMessage"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "IngestionRun"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "DocumentPage"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "DocumentTree"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "ChatSource"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Chat"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "ApiKey"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "User"`);
}

describe("Chat Integration — /api/v1/chat", () => {
  beforeAll(async () => {
    await cleanup();
    cookiesA = await createUserAndLogin(USER_A);
    cookiesB = await createUserAndLogin(USER_B);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe("CRUD", () => {
    test("POST /create — should create a chat", async () => {
      const res = await request
        .post("/api/v1/chat/create")
        .set("Cookie", cookiesA)
        .send({ docsUrl: "https://example.com/docs" });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.chatId).toBeDefined();
      chatId = res.body.data.chatId;
    });

    test("POST /create — should reject unauthenticated request", async () => {
      const res = await request
        .post("/api/v1/chat/create")
        .send({ docsUrl: "https://example.com/docs" });

      expect(res.status).toBe(401);
    });

    test("GET /list — should return user's chats", async () => {
      const res = await request
        .get("/api/v1/chat/list")
        .set("Cookie", cookiesA);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test("GET /:chatId — should return chat details", async () => {
      const res = await request
        .get(`/api/v1/chat/${chatId}`)
        .set("Cookie", cookiesA);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(chatId);
    });

    test("GET /:chatId — should reject access to another user's chat", async () => {
      const res = await request
        .get(`/api/v1/chat/${chatId}`)
        .set("Cookie", cookiesB);

      expect(res.status).toBe(403);
    });

    test("DELETE /:chatId — should delete own chat", async () => {
      const res = await request
        .delete(`/api/v1/chat/${chatId}`)
        .set("Cookie", cookiesA);

      expect(res.status).toBe(200);
    });

    test("DELETE /:chatId — should 404 on deleted chat", async () => {
      const res = await request
        .get(`/api/v1/chat/${chatId}`)
        .set("Cookie", cookiesA);

      expect(res.status).toBe(404);
    });
  });

  describe("Validation", () => {
    test("GET /:chatId — should reject invalid UUID", async () => {
      const res = await request
        .get("/api/v1/chat/not-a-uuid")
        .set("Cookie", cookiesA);

      expect(res.status).toBe(400);
    });

    test("POST /create — should reject missing docsUrl", async () => {
      const res = await request
        .post("/api/v1/chat/create")
        .set("Cookie", cookiesA)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
