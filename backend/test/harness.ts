import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as bcrypt from "bcryptjs";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertTestDatabase } = require("../scripts/test-db-guard") as { assertTestDatabase: (url: string) => string };

export type Api = { status: number; body: any };

export class Harness {
  app!: INestApplication;
  prisma!: PrismaService;
  base = "";
  private tokens = new Map<string, string>();

  async start() {
    // Fail-closed: validates the parsed database name (not the raw URL, which may end in ?schema=public).
    assertTestDatabase(process.env.DATABASE_URL ?? "");
    this.app = await NestFactory.create(AppModule, { logger: false });
    this.app.setGlobalPrefix("api");
    this.app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await this.app.listen(0);
    this.base = (await this.app.getUrl()).replace("[::1]", "localhost");
    this.prisma = this.app.get(PrismaService);
  }

  async stop() {
    await this.app.close();
  }

  /** Real public registration flow (always creates a STUDENT). */
  async register(name: string, email: string, password = "Password123!") {
    const res = await this.call("POST", "/api/auth/register", undefined, { name, email, password });
    if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
    this.tokens.set(email, res.body.token);
    return { id: res.body.user.id as number, email };
  }

  /** Platform administrators are created out-of-band (as in production), then log in normally. */
  async platformAdmin(email: string, password = "Password123!") {
    const user = await this.prisma.user.create({ data: { name: "Platform Admin", email, password: await bcrypt.hash(password, 4), role: "ADMIN" } });
    await this.login(email, password);
    return { id: user.id, email };
  }

  async login(email: string, password = "Password123!") {
    const res = await this.call("POST", "/api/auth/login", undefined, { email, password });
    if (res.status !== 201 && res.status !== 200) throw new Error(`login failed ${res.status}`);
    this.tokens.set(email, res.body.token);
    return res;
  }

  token(email: string) {
    const token = this.tokens.get(email);
    if (!token) throw new Error(`no token for ${email}`);
    return token;
  }

  call(method: string, path: string, as?: string, body?: unknown, headers: Record<string, string> = {}): Promise<Api> {
    return this.raw(method, path, as ? this.token(as) : undefined, body, headers);
  }

  async raw(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}): Promise<Api> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    return { status: res.status, body: parsed };
  }

  /** A READY document with searchable text, inserted directly (uploads need the extraction pipeline). */
  async document(ownerId: number, name: string, text: string) {
    const doc = await this.prisma.document.create({
      data: { name, userId: ownerId, status: "READY", extractedText: text, mimeType: "text/plain", chunks: { create: [{ content: text, chunkIndex: 0 }] } },
    });
    return doc.id;
  }
}
