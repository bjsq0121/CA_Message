import { Router } from "express";
import { v4 as uuid } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { getDb } from "../db/sqlite.js";

const router = Router();
router.use(authMiddleware);

// 내 채팅방 목록
router.get("/", async (req: AuthRequest, res) => {
  const db = getDb();
  const rooms = db.prepare(`
    SELECT r.room_id as ROOM_ID, r.room_nm as ROOM_NM, r.room_type as ROOM_TYPE,
           r.created_by, r.updated_at,
           (SELECT COUNT(*) FROM chat_member WHERE room_id = r.room_id) as MEMBER_COUNT,
           (SELECT content FROM chat_msg WHERE room_id = r.room_id ORDER BY created_at DESC LIMIT 1) as LAST_MSG,
           (SELECT COUNT(*) FROM chat_msg
            WHERE room_id = r.room_id
            AND created_at > COALESCE(m.last_read_at, '2000-01-01')
            AND user_id != :userId) as UNREAD_COUNT
    FROM chat_room r
    JOIN chat_member m ON m.room_id = r.room_id AND m.user_id = :userId
    ORDER BY r.updated_at DESC
  `).all({ userId: req.userId });

  // 각 방의 멤버 목록 추가
  for (const room of rooms as any[]) {
    const members = db.prepare(
      `SELECT user_id FROM chat_member WHERE room_id = ?`
    ).all(room.ROOM_ID);
    room.members = members.map((m: any) => m.user_id);
  }

  res.json(rooms);
});

// 채팅방 생성
router.post("/", async (req: AuthRequest, res) => {
  const { name, type = "GROUP", memberIds = [] } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const db = getDb();
  const roomId = uuid();
  const allMembers = [req.userId!, ...memberIds.filter((id: string) => id !== req.userId)];

  // DM이면 기존 방 확인
  if (type === "DM" && memberIds.length === 1) {
    const existing = db.prepare(`
      SELECT r.room_id FROM chat_room r
      WHERE r.room_type = 'DM'
      AND EXISTS (SELECT 1 FROM chat_member WHERE room_id = r.room_id AND user_id = ?)
      AND EXISTS (SELECT 1 FROM chat_member WHERE room_id = r.room_id AND user_id = ?)
      AND (SELECT COUNT(*) FROM chat_member WHERE room_id = r.room_id) = 2
    `).get(req.userId, memberIds[0]) as any;

    if (existing) {
      res.json({ roomId: existing.room_id, existing: true });
      return;
    }
  }

  const insertRoom = db.prepare(
    `INSERT INTO chat_room (room_id, room_nm, room_type, created_by) VALUES (?, ?, ?, ?)`
  );
  const insertMember = db.prepare(
    `INSERT OR IGNORE INTO chat_member (room_id, user_id, role) VALUES (?, ?, ?)`
  );

  const tx = db.transaction(() => {
    insertRoom.run(roomId, name, type, req.userId);
    for (const uid of allMembers) {
      insertMember.run(roomId, uid, uid === req.userId ? "OWNER" : "MEMBER");
    }
  });
  tx();

  res.status(201).json({ roomId, name, type });
});

// 채팅방 상세
router.get("/:roomId", async (req: AuthRequest, res) => {
  const db = getDb();

  const check = db.prepare(
    `SELECT 1 FROM chat_member WHERE room_id = ? AND user_id = ?`
  ).get(req.params.roomId, req.userId);

  if (!check) {
    res.status(403).json({ error: "Not a member of this room" });
    return;
  }

  const room = db.prepare(
    `SELECT room_id as ROOM_ID, room_nm as ROOM_NM, room_type as ROOM_TYPE,
            created_by, created_at,
            (SELECT COUNT(*) FROM chat_member WHERE room_id = ?) as MEMBER_COUNT
     FROM chat_room WHERE room_id = ?`
  ).get(req.params.roomId, req.params.roomId);

  const members = db.prepare(
    `SELECT user_id as USER_ID, role, joined_at FROM chat_member WHERE room_id = ?`
  ).all(req.params.roomId);

  res.json({ room, members });
});

// 멤버 추가
router.post("/:roomId/members", async (req: AuthRequest, res) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || !userIds.length) {
    res.status(400).json({ error: "userIds array required" });
    return;
  }

  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO chat_member (room_id, user_id) VALUES (?, ?)`
  );
  const tx = db.transaction(() => {
    for (const uid of userIds) insert.run(req.params.roomId, uid);
  });
  tx();

  res.json({ added: userIds.length });
});

// 방 나가기
router.delete("/:roomId/members/me", async (req: AuthRequest, res) => {
  const db = getDb();
  db.prepare(
    `DELETE FROM chat_member WHERE room_id = ? AND user_id = ?`
  ).run(req.params.roomId, req.userId);
  res.json({ ok: true });
});

export { router as roomRoutes };
