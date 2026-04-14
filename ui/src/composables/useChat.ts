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

// 방별 메시지 저장소 (메모리)
const roomMessages: Record<string, ChatMessage[]> = {};

// 방별 안읽은 수
const unreadCounts = reactive<Record<string, number>>({});

// 현재 활성 방 ID
let activeRoomId = "";

// 알림 권한 요청
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

// 알림음 (사용자 인터랙션 후에만 재생 가능)
let notifAudioCtx: AudioContext | null = null;

function playNotifSound() {
  try {
    if (!notifAudioCtx) notifAudioCtx = new AudioContext();
    const osc = notifAudioCtx.createOscillator();
    const gain = notifAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(notifAudioCtx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(notifAudioCtx.currentTime + 0.15);
  } catch {}
}

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

  // 유저별 알림 채널 구독 (초대/방 변경 알림)
  function subscribeUserChannel(onRoomUpdate: () => void) {
    if (!realtimeClient.value) return;
    const channel = realtimeClient.value.channels.get(`user:${currentUserId.value}`);
    channel.subscribe("room_invite", () => {
      onRoomUpdate();
    });
    channel.subscribe("room_update", () => {
      onRoomUpdate();
    });
  }

  // 초대 알림 발송 (초대한 사용자들에게)
  function notifyInvite(userIds: string[], roomName: string) {
    if (!realtimeClient.value) return;
    for (const uid of userIds) {
      const channel = realtimeClient.value.channels.get(`user:${uid}`);
      channel.publish("room_invite", { roomName, invitedBy: currentUserNm.value });
    }
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
    } catch {
      return [];
    }
  }

  function parseAblyMsg(roomId: string, ablyMsg: Ably.Message): ChatMessage {
    const data = ablyMsg.data as any;
    return {
      msgId: ablyMsg.id ?? `${Date.now()}-${Math.random()}`,
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

  // 모든 방 백그라운드 구독 — 메시지 저장 + 안읽음 카운트
  function subscribeAllRooms(
    rooms: ChatRoom[],
    onUpdate: (roomId: string, msg: ChatMessage) => void,
  ) {
    if (!realtimeClient.value) return;

    for (const room of rooms) {
      if (!roomMessages[room.ROOM_ID]) roomMessages[room.ROOM_ID] = [];

      const channel = realtimeClient.value.channels.get(`chat:${room.ROOM_ID}`);
      channel.subscribe("message", (ablyMsg) => {
        const msg = parseAblyMsg(room.ROOM_ID, ablyMsg);

        // 중복 방지
        const msgs = roomMessages[room.ROOM_ID];
        if (msgs.find((m) => m.msgId === msg.msgId)) return;
        msgs.push(msg);

        // 안읽음 카운트 (현재 보고 있는 방이 아닌 경우)
        if (activeRoomId !== room.ROOM_ID && msg.userId !== currentUserId.value) {
          unreadCounts[room.ROOM_ID] = (unreadCounts[room.ROOM_ID] ?? 0) + 1;
          playNotifSound();
          showBrowserNotification(
            room.ROOM_NM,
            `${msg.userNm}: ${msg.content}`,
          );
        }

        onUpdate(room.ROOM_ID, msg);
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
        setTimeout(() => {
          typingSet.delete(uid);
          onTyping([...typingSet]);
        }, 3000);
      });
    }

    if (onPresence) {
      channel.presence.subscribe(() => {
        channel.presence.get((err, members) => {
          if (!err && members) {
            onPresence(members.map((m) => m.clientId));
          }
        });
      });
      channel.presence.enter({ userNm: currentUserNm.value });
    }

    return () => {
      channel.presence.leave();
    };
  }

  async function loadHistory(roomId: string, before?: string): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
    try {
      const params: any = { limit: 50 };
      if (before) params.before = before;
      const res = await axios.get(`${API_BASE}/messages/${roomId}`, { headers: headers(), params });
      const data = res.data;

      // 히스토리를 메모리에 병합
      const existing = roomMessages[roomId] ?? [];
      for (const msg of data.messages) {
        if (!existing.find((m: ChatMessage) => m.msgId === msg.msgId)) {
          existing.push(msg);
        }
      }
      existing.sort((a: ChatMessage, b: ChatMessage) => a.createdAt.localeCompare(b.createdAt));
      roomMessages[roomId] = existing;

      return data;
    } catch {
      return { messages: roomMessages[roomId] ?? [], hasMore: false };
    }
  }

  function sendMessage(roomId: string, content: string, msgType = "TEXT", fileName?: string, fileUrl?: string) {
    if (!realtimeClient.value) return;
    const channel = realtimeClient.value.channels.get(`chat:${roomId}`);
    channel.publish("message", {
      userId: currentUserId.value,
      userNm: currentUserNm.value,
      content,
      msgType,
      fileName,
      fileUrl,
    });

    // API에 저장 (비동기, 실패해도 무시)
    axios.post(`${API_BASE}/messages/${roomId}`, {
      content, msgType, userNm: currentUserNm.value, fileName, fileUrl,
    }, { headers: headers() }).catch(() => {});
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
    sendMessage,
    sendTyping,
    disconnect,
  };
}
