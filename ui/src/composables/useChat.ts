import { ref, shallowRef, reactive } from "vue";
import * as Ably from "ably";
import axios from "axios";

const API_BASE = window.location.port === "3000" ? "http://localhost:3200" : "/api";

export interface ChatMessage {
  msgId: string;
  roomId: string;
  userId: string;
  userNm?: string;
  content: string;
  msgType?: string;
  fileName?: string;
  fileUrl?: string;
  createdAt: string;
  unreadCount?: number;
}

export interface ChatRoom {
  ROOM_ID: string;
  ROOM_NM: string;
  ROOM_TYPE: string;
  MEMBER_COUNT: number;
  LAST_MSG?: string;
  UNREAD_COUNT: number;
  members?: string[];
}

export interface ChatUser {
  USER_ID: string;
  USER_NM: string;
  DEPT_CD: string;
}

const realtimeClient = shallowRef<Ably.Realtime | null>(null);
const currentUserId = ref("");
const currentUserNm = ref("");
const connected = ref(false);
const token = ref("");

// 방별 메시지 저장소
const roomMessages: Record<string, ChatMessage[]> = {};

// 방별 안읽은 수
const unreadCounts = reactive<Record<string, number>>({});

// 현재 활성 방 ID
let activeRoomId = "";

// 중복 방지: content+userId+시간(초) 기반 키
function msgKey(m: { userId: string; content: string; createdAt: string }): string {
  return `${m.userId}|${m.content}|${m.createdAt.substring(0, 19)}`;
}

function addMessageIfNew(roomId: string, msg: ChatMessage): boolean {
  if (!roomMessages[roomId]) roomMessages[roomId] = [];
  const msgs = roomMessages[roomId];
  const key = msgKey(msg);
  if (msgs.find((m) => m.msgId === msg.msgId || msgKey(m) === key)) return false;
  msgs.push(msg);
  return true;
}

// 알림
function requestNotifPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

let notifAudioCtx: AudioContext | null = null;
let audioUnlocked = false;

// 사용자 첫 인터랙션 시 AudioContext 잠금 해제
function unlockAudio() {
  if (audioUnlocked) return;
  try {
    notifAudioCtx = new AudioContext();
    if (notifAudioCtx.state === "suspended") notifAudioCtx.resume();
    audioUnlocked = true;
  } catch {}
}

// 페이지 어디든 클릭/키보드 시 한 번만 잠금 해제
if (typeof window !== "undefined") {
  const unlock = () => { unlockAudio(); window.removeEventListener("click", unlock); window.removeEventListener("keydown", unlock); };
  window.addEventListener("click", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function playNotifSound() {
  try {
    if (!notifAudioCtx) { unlockAudio(); }
    if (!notifAudioCtx) return;
    if (notifAudioCtx.state === "suspended") notifAudioCtx.resume();
    const osc = notifAudioCtx.createOscillator();
    const gain = notifAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(notifAudioCtx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(notifAudioCtx.currentTime + 0.15);
  } catch {}
}

// 구독 중복 방지
const subscribedRoomIds = new Set<string>();

export function useChat() {
  function getToken() {
    return token.value || localStorage.getItem("ca_token") || "";
  }

  function headers() {
    return { Authorization: `Bearer ${getToken()}` };
  }

  async function connect() {
    const t = getToken();
    if (!t) return;
    token.value = t;

    const base64 = t.split(".")[1];
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    currentUserId.value = payload.sub ?? payload.userId;
    currentUserNm.value = payload.userNm ?? payload.sub;

    requestNotifPermission();

    realtimeClient.value = new Ably.Realtime({
      authCallback: async (_data, callback) => {
        try {
          const res = await axios.post(`${API_BASE}/auth/ably-token`, {}, { headers: headers() });
          callback(null, res.data);
        } catch (e: any) {
          callback(e, null);
        }
      },
    });

    await new Promise<void>((resolve) => {
      realtimeClient.value!.connection.once("connected", () => {
        connected.value = true;
        console.log("[ably] connected as", currentUserId.value);
        resolve();
      });
    });
  }

  function subscribeUserChannel(onRoomUpdate: () => void) {
    if (!realtimeClient.value) return;
    const channel = realtimeClient.value.channels.get(`user:${currentUserId.value}`);
    channel.subscribe("room_invite", () => onRoomUpdate());
    channel.subscribe("room_update", () => onRoomUpdate());
  }

  function notifyInvite(userIds: string[], roomName: string) {
    if (!realtimeClient.value) return;
    for (const uid of userIds) {
      const channel = realtimeClient.value.channels.get(`user:${uid}`);
      channel.publish("room_invite", { roomName, invitedBy: currentUserNm.value });
    }
  }

  // 읽음 상태 변경을 방에 알림
  function notifyRead(roomId: string) {
    if (!realtimeClient.value) return;
    const channel = realtimeClient.value.channels.get(`chat:${roomId}`);
    channel.publish("read", { userId: currentUserId.value, at: new Date().toISOString() });
  }

  async function getRooms(): Promise<ChatRoom[]> {
    const res = await axios.get(`${API_BASE}/rooms`, { headers: headers() });
    return res.data;
  }

  async function createRoom(name: string, type: string, memberIds: string[]) {
    const res = await axios.post(`${API_BASE}/rooms`, { name, type, memberIds }, { headers: headers() });
    return res.data;
  }

  async function getUsers(): Promise<ChatUser[]> {
    const res = await axios.get(`${API_BASE}/users`, { headers: headers() });
    return res.data;
  }

  async function getOrganization(): Promise<{ deptCd: string; deptNm: string; users: ChatUser[] }[]> {
    try {
      const res = await axios.get(`${API_BASE}/users/organization`, { headers: headers() });
      return res.data;
    } catch { return []; }
  }

  function parseAblyMsg(roomId: string, ablyMsg: Ably.Message): ChatMessage {
    const data = ablyMsg.data as any;
    return {
      msgId: ablyMsg.id ?? `ably-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId,
      userId: ablyMsg.clientId ?? data.userId ?? "",
      userNm: data.userNm ?? ablyMsg.clientId ?? "",
      content: data.content ?? data.text ?? "",
      msgType: data.msgType ?? "TEXT",
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      createdAt: new Date(ablyMsg.timestamp ?? Date.now()).toISOString(),
    };
  }

  // 모든 방 구독 — 실시간 메시지 수신 + 안읽음 + 읽음 알림
  function subscribeAllRooms(
    rooms: ChatRoom[],
    onNewMessage: (roomId: string, msg: ChatMessage) => void,
    onReadUpdate?: (roomId: string) => void,
  ) {
    if (!realtimeClient.value) return;

    for (const room of rooms) {
      // 이미 구독한 방은 건너뛰기
      if (subscribedRoomIds.has(room.ROOM_ID)) continue;
      subscribedRoomIds.add(room.ROOM_ID);

      if (!roomMessages[room.ROOM_ID]) roomMessages[room.ROOM_ID] = [];

      const channel = realtimeClient.value.channels.get(`chat:${room.ROOM_ID}`);

      channel.subscribe("message", (ablyMsg) => {
        const msg = parseAblyMsg(room.ROOM_ID, ablyMsg);
        if (!addMessageIfNew(room.ROOM_ID, msg)) return;

        if (activeRoomId !== room.ROOM_ID && msg.userId !== currentUserId.value) {
          unreadCounts[room.ROOM_ID] = (unreadCounts[room.ROOM_ID] ?? 0) + 1;
          playNotifSound();
          showBrowserNotification(room.ROOM_NM, `${msg.userNm}: ${msg.content}`);
        }

        onNewMessage(room.ROOM_ID, msg);
      });

      // 읽음 이벤트 수신 → unreadCount 갱신
      channel.subscribe("read", () => {
        if (onReadUpdate) onReadUpdate(room.ROOM_ID);
      });
    }
  }

  function getMessagesForRoom(roomId: string): ChatMessage[] {
    return roomMessages[roomId] ?? [];
  }

  function setActiveRoom(roomId: string) {
    activeRoomId = roomId;
    unreadCounts[roomId] = 0;
  }

  function subscribeToRoom(
    roomId: string,
    onTyping?: (typingUsers: string[]) => void,
    onPresence?: (presentUsers: string[]) => void,
  ) {
    if (!realtimeClient.value) return () => {};
    const channel = realtimeClient.value.channels.get(`chat:${roomId}`);

    if (onTyping) {
      const typingSet = new Set<string>();
      channel.subscribe("typing", (msg) => {
        const uid = msg.clientId ?? msg.data?.userId;
        if (!uid || uid === currentUserId.value) return;
        typingSet.add(uid);
        onTyping([...typingSet]);
        setTimeout(() => { typingSet.delete(uid); onTyping([...typingSet]); }, 3000);
      });
    }

    if (onPresence) {
      channel.presence.subscribe(() => {
        channel.presence.get((err, members) => {
          if (!err && members) onPresence(members.map((m) => m.clientId));
        });
      });
      channel.presence.enter({ userNm: currentUserNm.value });
    }

    return () => { channel.presence.leave(); };
  }

  async function loadHistory(roomId: string, before?: string): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
    try {
      const params: any = { limit: 50 };
      if (before) params.before = before;
      const res = await axios.get(`${API_BASE}/messages/${roomId}`, { headers: headers(), params });
      const data = res.data;

      // DB를 정본으로 — 메모리 초기화 후 DB 데이터 로드
      roomMessages[roomId] = data.messages;

      return { messages: data.messages, hasMore: data.hasMore };
    } catch {
      return { messages: roomMessages[roomId] ?? [], hasMore: false };
    }
  }

  async function markRead(roomId: string) {
    try {
      await axios.post(`${API_BASE}/messages/${roomId}/read`, {}, { headers: headers() });
      notifyRead(roomId);
    } catch {}
  }

  async function refreshUnreadCounts(roomId: string): Promise<ChatMessage[]> {
    try {
      const res = await axios.get(`${API_BASE}/messages/${roomId}`, { headers: headers(), params: { limit: 50 } });
      roomMessages[roomId] = res.data.messages;
      return res.data.messages;
    } catch {
      return roomMessages[roomId] ?? [];
    }
  }

  function sendMessage(roomId: string, content: string, msgType = "TEXT", fileName?: string, fileUrl?: string) {
    if (!realtimeClient.value) return;

    // 1. API에 저장 먼저 (DB가 정본)
    axios.post(`${API_BASE}/messages/${roomId}`, {
      content, msgType, userNm: currentUserNm.value, fileName, fileUrl,
    }, { headers: headers() }).catch(() => {});

    // 2. Ably로 실시간 전달
    const channel = realtimeClient.value.channels.get(`chat:${roomId}`);
    channel.publish("message", {
      userId: currentUserId.value,
      userNm: currentUserNm.value,
      content,
      msgType,
      fileName,
      fileUrl,
    });
  }

  function sendTyping(roomId: string) {
    if (!realtimeClient.value) return;
    const channel = realtimeClient.value.channels.get(`chat:${roomId}`);
    channel.publish("typing", { userId: currentUserId.value });
  }

  function disconnect() {
    if (realtimeClient.value) {
      realtimeClient.value.close();
      realtimeClient.value = null;
      connected.value = false;
    }
  }

  return {
    currentUserId,
    currentUserNm,
    connected,
    unreadCounts,
    connect,
    getRooms,
    createRoom,
    getUsers,
    getOrganization,
    subscribeAllRooms,
    subscribeToRoom,
    subscribeUserChannel,
    notifyInvite,
    getMessagesForRoom,
    setActiveRoom,
    loadHistory,
    markRead,
    refreshUnreadCounts,
    sendMessage,
    sendTyping,
    disconnect,
  };
}
