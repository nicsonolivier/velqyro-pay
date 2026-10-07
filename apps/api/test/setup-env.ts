import { testDatabaseUrl } from "./env";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl();
process.env.APP_URL ??= "http://localhost:5173";
process.env.WEB_ORIGINS ??= "http://localhost:5173";
process.env.APP_ENCRYPTION_KEY ??= "ZGV2LW9ubHktbmFvLXVzYXItZW0tcHJvZHVjYW8hISE=";
process.env.COOKIE_SECURE = "false";
