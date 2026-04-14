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

  // 각 메시지별 안읽은 인원 수 계산
  const totalMembers = (db.prepare(
    `SELECT COUNT(*) as cnt FROM chat_member WHERE room_id = ?`
  ).get(roomId) as any).cnt;

  const readCounts = db.prepare(
    `SELECT COUNT(*) as cnt FROM chat_member
     WHERE room_id = ? AND last_read_at >= ?`
  );

  const messagesWithRead = rows.reverse().map((msg: any) => {
    const readCnt = (readCounts.get(roomId, msg.createdAt) as any).cnt;
    return { ...msg, unreadCount: Math.max(0, totalMembers - readCnt) };
  });

  res.json({ messages: messagesWithRead, hasMore, totalMembers });
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

// 읽음 처리 (클라이언트에서 방 진입 시 호출)
router.post("/:roomId/read", async (req: AuthRequest, res) => {
  const db = getDb();
  db.prepare(
    `UPDATE chat_member SET last_read_at = datetime('now', 'localtime') WHERE room_id = ? AND user_id = ?`
  ).run(req.params.roomId, req.userId);
  res.json({ ok: true });
});

// 메시지 1건 삭제 (본인 메시지만)
router.delete("/:roomId/:msgId", async (req: AuthRequest, res) => {
  const db = getDb();
  db.prepare(
    `DELETE FROM chat_msg WHERE msg_id = ? AND room_id = ? AND user_id = ?`
  ).run(req.params.msgId, req.params.roomId, req.userId);
  res.json({ ok: true });
});

// 대화 전체 지우기 (해당 방의 내 메시지 전부 삭제)
router.delete("/:roomId", async (req: AuthRequest, res) => {
  const db = getDb();
  db.prepare(
    `DELETE FROM chat_msg WHERE room_id = ? AND user_id = ?`
  ).run(req.params.roomId, req.userId);
  res.json({ ok: true });
});

export { router as messageRoutes };
