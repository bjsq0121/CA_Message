import oracledb from "oracledb";

let pool: oracledb.Pool | null = null;

export async function initDb() {
  try {
    pool = await oracledb.createPool({
      user: process.env.ORACLE_USER ?? "CA_ERP_HCC",
      password: process.env.ORACLE_PASSWORD ?? "",
      connectString: process.env.ORACLE_CONNECT_STRING ?? "192.168.114.6:1521/CADB",
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
    });
    console.log("[db] Oracle pool created");

    // 메신저 테이블 생성 (없으면)
    await ensureTables();
  } catch (err) {
    console.error("[db] Oracle connection failed:", err);
    console.warn("[db] Running without database — API will return mock data");
    pool = null;
  }
}

export async function closeDb() {
  if (pool) {
    await pool.close(0);
    console.log("[db] Oracle pool closed");
  }
}

export async function getConnection() {
  if (!pool) throw new Error("Database not connected");
  return pool.getConnection();
}

export function isDbConnected(): boolean {
  return pool !== null;
}

async function ensureTables() {
  const conn = await getConnection();
  try {
    const tables = [
      `CREATE TABLE TWC_CHAT_ROOM (
        ROOM_ID VARCHAR2(36) DEFAULT SYS_GUID() PRIMARY KEY,
        ROOM_NM VARCHAR2(200) NOT NULL,
        ROOM_TYPE VARCHAR2(10) DEFAULT 'GROUP' NOT NULL,
        ROOM_IMG VARCHAR2(500),
        CREATED_BY VARCHAR2(20) NOT NULL,
        CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP,
        UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP
      )`,
      `CREATE TABLE TWC_CHAT_MEMBER (
        ROOM_ID VARCHAR2(36) NOT NULL,
        USER_ID VARCHAR2(20) NOT NULL,
        ROLE VARCHAR2(10) DEFAULT 'MEMBER',
        JOINED_AT TIMESTAMP DEFAULT SYSTIMESTAMP,
        LAST_READ_AT TIMESTAMP,
        CONSTRAINT PK_CHAT_MEMBER PRIMARY KEY (ROOM_ID, USER_ID),
        CONSTRAINT FK_CHAT_MEMBER_ROOM FOREIGN KEY (ROOM_ID) REFERENCES TWC_CHAT_ROOM(ROOM_ID)
      )`,
      `CREATE TABLE TWC_CHAT_MSG (
        MSG_ID VARCHAR2(36) DEFAULT SYS_GUID() PRIMARY KEY,
        ROOM_ID VARCHAR2(36) NOT NULL,
        USER_ID VARCHAR2(20) NOT NULL,
        CONTENT CLOB NOT NULL,
        MSG_TYPE VARCHAR2(10) DEFAULT 'TEXT',
        REPLY_TO VARCHAR2(36),
        CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP,
        CONSTRAINT FK_CHAT_MSG_ROOM FOREIGN KEY (ROOM_ID) REFERENCES TWC_CHAT_ROOM(ROOM_ID)
      )`,
    ];

    const indexes = [
      `CREATE INDEX IDX_CHAT_MSG_ROOM ON TWC_CHAT_MSG(ROOM_ID, CREATED_AT DESC)`,
      `CREATE INDEX IDX_CHAT_MEMBER_USER ON TWC_CHAT_MEMBER(USER_ID)`,
    ];

    for (const ddl of [...tables, ...indexes]) {
      try {
        await conn.execute(ddl);
      } catch (e: any) {
        // ORA-00955: name is already used — table exists
        if (e.errorNum !== 955) {
          console.warn("[db] DDL warning:", e.message?.substring(0, 80));
        }
      }
    }
    await conn.commit();
    console.log("[db] Messenger tables ready");
  } finally {
    await conn.close();
  }
}
