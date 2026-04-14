import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.resolve("data", "messenger.db");

let db: Database.Database | null = null;

export function initSqlite() {
  const fs = require("node:fs");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_room (
      room_id TEXT PRIMARY KEY,
      room_nm TEXT NOT NULL,
      room_type TEXT DEFAULT 'GROUP',
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS chat_member (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'MEMBER',
      joined_at TEXT DEFAULT (datetime('now', 'localtime')),
      last_read_at TEXT,
      PRIMARY KEY (room_id, user_id),
      FOREIGN KEY (room_id) REFERENCES chat_room(room_id)
    );

    CREATE TABLE IF NOT EXISTS chat_msg (
      msg_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_nm TEXT,
      content TEXT NOT NULL,
      msg_type TEXT DEFAULT 'TEXT',
      file_name TEXT,
      file_url TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (room_id) REFERENCES chat_room(room_id)
    );

    CREATE INDEX IF NOT EXISTS idx_msg_room ON chat_msg(room_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_member_user ON chat_member(user_id);
  `);

  console.log("[sqlite] Messenger DB ready:", DB_PATH);
}

export function getDb(): Database.Database {
  if (!db) throw new Error("SQLite not initialized");
  return db;
}

export function closeSqlite() {
  if (db) {
    db.close();
    console.log("[sqlite] closed");
  }
}
