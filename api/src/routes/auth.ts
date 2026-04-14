import { Router } from "express";
import Ably from "ably";
import jwt from "jsonwebtoken";
import axios from "axios";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const JWT_EXPIRES_IN = "8h";
const ERP_API_URL = process.env.ERP_API_URL ?? "http://localhost:2026";

// 테스트용 계정 (ERP 서버 없을 때 폴백)
const TEST_USERS: Record<string, { password: string; userNm: string; deptCd: string; bzpc: string }> = {
  admin:  { password: "1234", userNm: "관리자",   deptCd: "DEV", bzpc: "A101" },
  user1:  { password: "1234", userNm: "김철수",   deptCd: "DEV", bzpc: "A101" },
  user2:  { password: "1234", userNm: "이영희",   deptCd: "DEV", bzpc: "A101" },
  user3:  { password: "1234", userNm: "박지민",   deptCd: "SALES", bzpc: "A102" },
  user4:  { password: "1234", userNm: "최동욱",   deptCd: "SALES", bzpc: "A102" },
};

function makeToken(userId: string, userNm: string, deptCd: string, bzpc: string) {
  return jwt.sign(
    { sub: userId, userId, userNm, deptCd, bzpc },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// 로그인
router.post("/login", async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) {
    res.status(400).json({ error: "userId, password 필수" });
    return;
  }

  // 1. CA_NERP ERP API로 로그인 시도
  try {
    const erpRes = await axios.post(`${ERP_API_URL}/login`,
      `username=${encodeURIComponent(userId)}&password=${encodeURIComponent(password)}`,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
        validateStatus: () => true,
      }
    );

    if (erpRes.status === 200) {
      // 성공: 헤더 "access"에서 JWT 추출 (Bearer 접두어 제거)
      const accessHeader = erpRes.headers["access"] ?? "";
      const erpToken = accessHeader.replace("Bearer ", "").trim();

      if (erpToken) {
        const decoded = jwt.decode(erpToken) as any;
        const userBody = erpRes.data ?? {};
        const userNm = userBody.userNm ?? decoded?.userNm ?? userId;
        const deptCd = userBody.deptCd ?? decoded?.deptCd ?? "";
        const bzpc = userBody.bzpc ?? decoded?.bzpc ?? "";

        res.json({
          token: erpToken,
          user: { userId, userNm, deptCd, bzpc },
        });
        console.log(`[auth] ERP login OK: ${userId} (${userNm})`);
        return;
      }
    }

    // ERP에서 403이면 비밀번호 틀림
    if (erpRes.status === 403 || erpRes.status === 401) {
      const errMsg = erpRes.data?.error ?? "아이디 또는 비밀번호가 일치하지 않습니다";
      res.status(401).json({ error: errMsg });
      return;
    }
  } catch (err: any) {
    console.warn(`[auth] ERP API unreachable (${ERP_API_URL}):`, err.message);
  }

  // 2. ERP 연결 불가 시 테스트 계정 폴백
  const testUser = TEST_USERS[userId];
  if (!testUser || testUser.password !== password) {
    res.status(401).json({ error: "아이디 또는 비밀번호가 일치하지 않습니다" });
    return;
  }

  res.json({
    token: makeToken(userId, testUser.userNm, testUser.deptCd, testUser.bzpc),
    user: { userId, userNm: testUser.userNm, deptCd: testUser.deptCd, bzpc: testUser.bzpc },
  });
});

// Ably 토큰 발급
router.post("/ably-token", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "ABLY_API_KEY not configured" });
      return;
    }

    const ably = new Ably.Rest({ key: apiKey });
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: req.userId!,
      capability: {
        "*": ["publish", "subscribe", "presence", "history"],
      },
    });

    res.json(tokenRequest);
  } catch (err: any) {
    console.error("[auth] Ably token error:", err.message);
    res.status(500).json({ error: "Failed to generate Ably token" });
  }
});

// 내 정보
router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  res.json({ userId: req.userId, userNm: req.userNm });
});

export { router as authRoutes };
