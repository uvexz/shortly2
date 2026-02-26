import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
})

export const db = drizzle(client, { schema })

let initPromise: Promise<void> | null = null

export function initDb(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = _initDb()
  return initPromise
}

async function _initDb() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS passkey (
      id TEXT PRIMARY KEY,
      name TEXT,
      public_key TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL,
      counter INTEGER NOT NULL,
      device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL,
      transports TEXT,
      aaguid TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS short_link (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
      original_url TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      clicks INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS click_log (
      id TEXT PRIMARY KEY,
      link_id TEXT NOT NULL REFERENCES short_link(id) ON DELETE CASCADE,
      referrer TEXT,
      user_agent TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS site_setting (
      id TEXT PRIMARY KEY DEFAULT 'default',
      site_name TEXT NOT NULL DEFAULT 'Shortly',
      site_url TEXT NOT NULL DEFAULT 'http://localhost:3000',
      allow_anonymous INTEGER NOT NULL DEFAULT 1
    );

    INSERT OR IGNORE INTO site_setting (id) VALUES ('default');
  `)
}
