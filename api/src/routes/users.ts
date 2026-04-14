import { Router } from "express";
import axios from "axios";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const ERP_API_URL = process.env.ERP_API_URL ?? "http://localhost:2026";

// 테스트 사용자 (ERP 연결 불가 시 폴백)
const TEST_USERS = [
  { userId: "admin", userNm: "관리자", deptCd: "DEV", deptNm: "개발팀", psitCd: "", bzpc: "A101" },
  { userId: "user1", userNm: "김철수", deptCd: "DEV", deptNm: "개발팀", psitCd: "", bzpc: "A101" },
  { userId: "user2", userNm: "이영희", deptCd: "DEV", deptNm: "개발팀", psitCd: "", bzpc: "A101" },
  { userId: "user3", userNm: "박지민", deptCd: "SALES", deptNm: "영업팀", psitCd: "", bzpc: "A102" },
  { userId: "user4", userNm: "최동욱", deptCd: "SALES", deptNm: "영업팀", psitCd: "", bzpc: "A102" },
];

// ERP에서 사용자 캐시 (5분)
let userCache: any[] | null = null;
let userCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchErpUsers(token: string): Promise<any[]> {
  if (userCache && Date.now() - userCacheTime < CACHE_TTL) return userCache;

  try {
    const res = await axios.post(
      `${ERP_API_URL}/UserMng/searchUserAjax`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "access": `Bearer ${token}`,
        },
        timeout: 5000,
      }
    );

    const data = res.data;
    const list = data.resultList ?? data.list ?? [];

    if (list.length > 0) {
      userCache = list;
      userCacheTime = Date.now();
      console.log(`[users] ERP users cached: ${list.length}명`);
      return list;
    }
  } catch (err: any) {
    console.warn("[users] ERP API failed:", err.message);
  }

  return [];
}

// 사용자 목록 (조직 계층 포함)
router.get("/", async (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
  const search = (req.query.search as string ?? "").toLowerCase();

  // ERP에서 가져오기
  let users = await fetchErpUsers(token);

  if (users.length === 0) {
    // 폴백: 테스트 사용자
    const filtered = search
      ? TEST_USERS.filter((u) => u.userNm.includes(search) || u.userId.includes(search))
      : TEST_USERS;
    res.json(filtered.map((u) => ({
      USER_ID: u.userId,
      USER_NM: u.userNm,
      DEPT_CD: u.deptCd,
      DEPT_NM: u.deptNm,
      PSIT_CD: u.psitCd,
      BZPC: u.bzpc,
    })));
    return;
  }

  // 검색 필터
  if (search) {
    users = users.filter((u: any) =>
      (u.userNm ?? "").toLowerCase().includes(search) ||
      (u.userId ?? "").toLowerCase().includes(search)
    );
  }

  // 필드명 정규화
  res.json(users.map((u: any) => ({
    USER_ID: u.userId ?? u.USER_ID,
    USER_NM: u.userNm ?? u.USER_NM,
    DEPT_CD: u.deptCd ?? u.DEPT_CD ?? "",
    DEPT_NM: u.deptNm ?? u.DEPT_NM ?? "",
    PSIT_CD: u.psitCd ?? u.PSIT_CD ?? "",
    BZPC: u.bzpc ?? u.BZPC ?? "",
    USER_TYPE_CD: u.userTypeCd ?? u.USER_TYPE_CD ?? "",
  })));
});

// 조직도 (부서별 그룹핑)
router.get("/organization", async (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
  let users = await fetchErpUsers(token);

  if (users.length === 0) {
    users = TEST_USERS.map((u) => ({ ...u, USER_ID: u.userId, USER_NM: u.userNm, DEPT_CD: u.deptCd, DEPT_NM: u.deptNm }));
  }

  // 부서별 그룹핑
  const deptMap = new Map<string, { deptCd: string; deptNm: string; users: any[] }>();

  for (const u of users) {
    const deptCd = u.deptCd ?? u.DEPT_CD ?? "기타";
    const deptNm = u.deptNm ?? u.DEPT_NM ?? deptCd;
    if (!deptMap.has(deptCd)) {
      deptMap.set(deptCd, { deptCd, deptNm, users: [] });
    }
    deptMap.get(deptCd)!.users.push({
      USER_ID: u.userId ?? u.USER_ID,
      USER_NM: u.userNm ?? u.USER_NM,
      PSIT_CD: u.psitCd ?? u.PSIT_CD ?? "",
      BZPC: u.bzpc ?? u.BZPC ?? "",
    });
  }

  res.json([...deptMap.values()]);
});

export { router as userRoutes };
