import { Router } from "express";
import { v4 as uuid } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { getDb } from "../db/sqlite.js";

const router = Router();
router.use(authMiddleware);

// 메시지 히스토리 조회 (페이징)
router.get("/:roomId", async (req: AuthRequest, res) => {
  const { roomId } = req.params;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const before = req.query.before as string | undefined;

  const db = getDb();

  // 멤버 확인
  const check = db.prepare(
    `SELECT 1 FROM chat_member WHERE room_id = ? AND user_id = ?`
  ).get(roomId, req.userId);
  if (!check) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  let rows: any[];
  if (before) {
    rows = db.prepare(`
      SELECT msg_id as msgId, room_id as roomId, user_id as userId, user_nm as userNm,
             content, msg_type as msgType, file_name as fileName, file_url as fileUrl, created_at as createdAt
      FROM chat_msg
      WHERE room_id = ? AND created_at < ?
      ORDER BY created_at DESC LIMIT ?
    `).all(roomId, before, limit + 1);
  } else {
    rows = db.prepare(`
      SELECT msg_id as msgId, room_id as roomId, user_id as userId, user_nm as userNm,
             content, msg_type as msgType, file_name as fileName, file_url as fileUrl, created_at as createdAt
      FROM chat_msg
      WHERE room_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(roomId, limit + 1);
  }

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  // 읽음 시간 갱신
  db.prepare(
    `UPDATE chat_member SET last_read_at = datetime('now', 'localtime') WHERE room_id = ? AND user_id = ?`
  ).run(roomId, req.userId);

  res.json({ messages: rows.reverse(), hasMore });
});

// 메시지 저장
router.post("/:roomId", async (req: AuthRequest, res) => {
  const { content, msgType = "TEXT", userNm, fileName, fileUrl } = req.body;
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const db = getDb();
  const msgId = uuid();

  db.prepare(`
    INSERT INTO chat_msg (msg_id, room_id, user_id, user_nm, content, msg_type, file_name, file_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(msgId, req.params.roomId, req.userId, userNm ?? req.userId, content, msgType, fileName ?? null, fileUrl ?? null);

  // 방 업데이트 시간 갱신
  db.prepare(
    `UPDATE chat_room SET updated_at = datetime('now', 'localtime') WHERE room_id = ?`
  ).run(req.params.roomId);

  res.status(201).json({ msgId });
});

export { router as messageRoutes };
