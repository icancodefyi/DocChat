import { jest } from "@jest/globals";
import { mockAllExternal } from "../helpers/mockExternal.js";
mockAllExternal(jest);

const { app } = await import("../../app.js");
import supertest from "supertest";
import prisma from "../../utils/prismaClient.js";

const request = supertest(app);

const TEST_USER = {
  email: "msgs@example.com",
  fullname: "Message User",
  username: "msgsuser",
  password: "Password123!",
};

let cookies;
let chatId;

async function createUserAndLogin() {
  await request.post("/api/v1/user/send-verification-code").send({ email: TEST_USER.email });
  const redis = (await import("../../utils/redis.js")).default;
  const code = await redis.get(TEST_USER.email);
  await request.post("/api/v1/user/verify-email").send({ email: TEST_USER.email, code: Number(code) });
  await request.post("/api/v1/user/register").send(TEST_USER);
  const loginRes = await request.post("/api/v1/user/login").send({ email: TEST_USER.email, password: TEST_USER.password });
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

describe("Message Integration — /api/v1/message", () => {
  beforeAll(async () => {
    await cleanup();
    cookies = await createUserAndLogin();

    const chatRes = await request
      .post("/api/v1/chat/create")
      .set("Cookie", cookies)
      .send({ docsUrl: "https://example.com/docs" });

    chatId = chatRes.body.data.chatId;

    await prisma.chat.update({
      where: { id: chatId },
      data: { status: "READY" },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe("Sending messages (SSE)", () => {
    test("POST /send — should stream a response", async () => {
      const res = await request
        .post("/api/v1/message/send")
        .set("Cookie", cookies)
        .send({ chatId, userPrompt: "What is this documentation about?", model: "default-1", provider: "DEFAULT" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
      expect(res.text).toContain("test response");
    });

    test("POST /send — should reject unauthenticated", async () => {
      const res = await request
        .post("/api/v1/message/send")
        .send({ chatId, userPrompt: "Hello", model: "default-1", provider: "DEFAULT" });

      expect(res.status).toBe(401);
    });

    test("POST /send — should reject invalid chatId", async () => {
      const res = await request
        .post("/api/v1/message/send")
        .set("Cookie", cookies)
        .send({ chatId: "not-a-uuid", userPrompt: "Hello", model: "default-1", provider: "DEFAULT" });

      expect(res.status).toBe(400);
    });

    test("POST /send — should reject empty userPrompt", async () => {
      const res = await request
        .post("/api/v1/message/send")
        .set("Cookie", cookies)
        .send({ chatId, userPrompt: "", model: "default-1", provider: "DEFAULT" });

      expect(res.status).toBe(400);
    });
  });

  describe("Reading messages", () => {
    test("GET /all/:chatId — should return messages", async () => {
      const res = await request
        .get(`/api/v1/message/all/${chatId}`)
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
    });

    test("GET /models — should return available models", async () => {
      const res = await request
        .get("/api/v1/message/models")
        .set("Cookie", cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.models).toBeDefined();
    });
  });
});
