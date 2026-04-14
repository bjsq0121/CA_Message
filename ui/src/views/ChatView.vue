<template>
  <div id="app">
    <!-- Sidebar -->
    <div class="sidebar" :class="{ hidden: activeRoom && isMobile }">
      <div class="sidebar-header">
        <span>CA Messenger</span>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;opacity:0.6">{{ currentUserNm }}</span>
          <button class="new-chat-btn" @click="openCreateRoom">+</button>
          <button class="new-chat-btn" style="background:#e74c3c;font-size:14px" @click="logout">✕</button>
        </div>
      </div>
      <div class="search-box">
        <input v-model="searchQuery" placeholder="채팅방 검색..." />
      </div>
      <div class="room-list">
        <div
          v-for="room in filteredRooms"
          :key="room.ROOM_ID"
          class="room-item"
          :class="{ active: activeRoom?.ROOM_ID === room.ROOM_ID }"
          @click="selectRoom(room)"
          @contextmenu.prevent="onRoomContext($event, room)"
        >
          <div class="room-avatar">{{ room.ROOM_NM?.charAt(0) }}</div>
          <div class="room-info">
            <div class="room-name">{{ room.ROOM_NM }}</div>
            <div class="room-preview">{{ room.LAST_MSG || '대화를 시작하세요' }}</div>
          </div>
          <div class="room-meta">
            <span style="font-size:11px;opacity:0.5">{{ room.MEMBER_COUNT }}명</span>
            <div v-if="unreadCounts[room.ROOM_ID]" class="unread-badge">{{ unreadCounts[room.ROOM_ID] }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Chat Area -->
    <div class="chat-area" :class="{ active: activeRoom }">
      <template v-if="activeRoom">
        <div class="chat-header">
          <button v-if="isMobile" @click="activeRoom = null" style="background:none;border:none;font-size:20px;cursor:pointer">&#8592;</button>
          <div style="flex:1">
            <div class="chat-header-name">{{ activeRoom.ROOM_NM }}</div>
            <div class="chat-header-status">
              {{ typingUsers.length ? typingText : onlineText }}
            </div>
          </div>
          <!-- 검색 토글 -->
          <button @click="showSearch = !showSearch" class="header-btn">&#128269;</button>
          <button @click="showMembers = !showMembers" class="header-btn">&#128101; {{ activeRoom.MEMBER_COUNT }}</button>
          <button @click="openInvite" class="header-btn">+ 초대</button>
          <button @click="closeChat" class="header-btn" style="color:#e74c3c">&#10005;</button>
        </div>

        <!-- 검색바 -->
        <div v-if="showSearch" class="search-bar">
          <input v-model="msgSearchQuery" placeholder="메시지 검색..." class="search-bar-input" @input="searchMessages" />
          <span v-if="msgSearchResults.length" style="font-size:12px;color:#999">{{ msgSearchIdx + 1 }}/{{ msgSearchResults.length }}</span>
          <button v-if="msgSearchResults.length" @click="prevSearchResult" class="search-bar-btn">&#9650;</button>
          <button v-if="msgSearchResults.length" @click="nextSearchResult" class="search-bar-btn">&#9660;</button>
          <button @click="showSearch = false; msgSearchQuery = ''; msgSearchResults = []" class="search-bar-btn">&#10005;</button>
        </div>

        <!-- 멤버 패널 -->
        <div v-if="showMembers" class="member-panel">
          <div class="member-panel-header">
            <span>참여 멤버 ({{ roomMembers.length }}명)</span>
            <button @click="showMembers = false" style="background:none;border:none;cursor:pointer;color:#999">&#10005;</button>
          </div>
          <div v-for="m in roomMembers" :key="m.USER_ID" class="member-item">
            <div class="member-avatar" :class="{ online: onlineUsers.includes(m.USER_ID) }">{{ m.USER_NM?.charAt(0) }}</div>
            <div class="member-info">
              <div class="member-name">{{ m.USER_NM }} <span v-if="m.USER_ID === currentUserId" style="color:#999;font-size:11px">(나)</span></div>
              <div class="member-dept">{{ DEPT_NAMES[m.DEPT_CD] || m.DEPT_CD || '' }}</div>
            </div>
            <div v-if="onlineUsers.includes(m.USER_ID)" class="member-online-badge">접속중</div>
          </div>
        </div>

        <!-- 메시지 영역 -->
        <div class="chat-messages" ref="messagesEl">
          <div v-if="!messages.length" style="text-align:center;padding:40px;color:#999">
            대화를 시작하세요
          </div>
          <template v-for="(msg, i) in messages" :key="msg.msgId">
            <div v-if="shouldShowSender(i)" class="msg-sender">{{ msg.userNm || msg.userId }}</div>
            <div
              class="msg-bubble"
              :class="[msg.userId === currentUserId ? 'msg-mine' : 'msg-other', { 'msg-highlight': msgSearchResults.includes(i) }]"
              :ref="(el) => { if (msgSearchResults[msgSearchIdx] === i) searchTargetEl = el as HTMLElement; }"
              @contextmenu.prevent="onMsgContext($event, msg)"
            >
              <!-- 이미지 -->
              <template v-if="msg.msgType === 'IMAGE'">
                <img :src="getFileUrl(msg.fileUrl!)" :alt="msg.fileName" class="msg-image" @click="openImage(msg.fileUrl!)" />
              </template>
              <!-- 파일 -->
              <template v-else-if="msg.msgType === 'FILE'">
                <a :href="getFileUrl(msg.fileUrl!)" download class="msg-file">
                  &#128206; {{ msg.fileName || '파일 다운로드' }}
                </a>
              </template>
              <!-- 텍스트 -->
              <template v-else>{{ msg.content }}</template>
            </div>
            <div class="msg-meta" :style="{ textAlign: msg.userId === currentUserId ? 'right' : 'left' }">
              <span v-if="msg.unreadCount" class="msg-unread">{{ msg.unreadCount }}</span>
              <span class="msg-time-text">{{ formatTime(msg.createdAt) }}</span>
            </div>
          </template>
        </div>

        <div v-if="typingUsers.length" class="typing-indicator">{{ typingText }}</div>

        <!-- 입력 영역 -->
        <div class="chat-input">
          <label class="attach-btn">
            &#128206;
            <input type="file" @change="onFileSelect" hidden />
          </label>
          <textarea
            v-model="inputText"
            @keydown.enter.exact.prevent="send"
            @input="onTyping"
            placeholder="메시지를 입력하세요..."
            rows="1"
          />
          <button class="send-btn" :disabled="!inputText.trim() && !uploadingFile" @click="send">&#8593;</button>
        </div>
        <div v-if="uploadingFile" style="padding:4px 20px;font-size:12px;color:#4A90D9">파일 업로드 중...</div>
      </template>
      <div v-else class="empty-state">
        <div style="text-align:center">
          <div style="font-size:48px;margin-bottom:16px">&#128172;</div>
          <div>채팅방을 선택하세요</div>
        </div>
      </div>
    </div>

    <!-- Modal: 채팅방 만들기 -->
    <div v-if="showCreateRoom" class="modal-overlay" @click.self="showCreateRoom = false">
      <div class="modal-card">
        <div class="modal-header">
          <span>새 채팅방</span>
          <button @click="showCreateRoom = false" class="modal-close">&#10005;</button>
        </div>
        <div class="modal-body">
          <input v-model="newRoomName" placeholder="채팅방 이름" class="modal-input" autofocus />
          <div style="margin-top:8px">
            <select v-model="newRoomType" class="modal-input" style="padding:10px 14px">
              <option value="GROUP">그룹 채팅</option>
              <option value="DM">1:1 채팅</option>
              <option value="DEPT">부서 채팅</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showCreateRoom = false" class="modal-btn-cancel">취소</button>
          <button @click="doCreateRoom" class="modal-btn-ok" :disabled="!newRoomName.trim()">만들기</button>
        </div>
      </div>
    </div>

    <!-- Modal: 멤버 초대 -->
    <div v-if="showInvite" class="modal-overlay" @click.self="showInvite = false">
      <div class="modal-card" style="max-width:420px">
        <div class="modal-header">
          <span>멤버 초대 - {{ activeRoom?.ROOM_NM }}</span>
          <button @click="showInvite = false" class="modal-close">&#10005;</button>
        </div>
        <div class="modal-body">
          <input v-model="inviteSearch" placeholder="이름 또는 아이디 검색..." class="modal-input" />
          <div class="org-tree">
            <div v-for="dept in groupedUsers" :key="dept.deptCd" class="org-dept">
              <div class="org-dept-header" @click="dept.open = !dept.open">
                <span>{{ dept.open ? '&#9660;' : '&#9654;' }}</span>
                <span class="org-dept-name">{{ dept.deptNm }}</span>
                <span class="org-dept-count">{{ dept.users.length }}명</span>
              </div>
              <div v-if="dept.open" class="org-dept-users">
                <div
                  v-for="u in dept.users"
                  :key="u.USER_ID"
                  class="org-user"
                  :class="{ selected: selectedUsers.includes(u.USER_ID), disabled: u.USER_ID === currentUserId || currentMembers.includes(u.USER_ID) }"
                  @click="toggleUser(u.USER_ID)"
                >
                  <div class="org-user-avatar">{{ u.USER_NM.charAt(0) }}</div>
                  <div class="org-user-info">
                    <div class="org-user-name">{{ u.USER_NM }}</div>
                    <div class="org-user-id">{{ u.USER_ID }}</div>
                  </div>
                  <div v-if="selectedUsers.includes(u.USER_ID)" class="org-user-check">&#10003;</div>
                  <div v-else-if="currentMembers.includes(u.USER_ID)" class="org-user-tag">참여중</div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="selectedUsers.length" class="selected-tags">
            <span v-for="uid in selectedUsers" :key="uid" class="selected-tag">
              {{ getUserName(uid) }}
              <span @click="toggleUser(uid)" style="cursor:pointer;margin-left:4px">&#10005;</span>
            </span>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showInvite = false" class="modal-btn-cancel">취소</button>
          <button @click="doInvite" class="modal-btn-ok" :disabled="!selectedUsers.length">
            {{ selectedUsers.length }}명 초대
          </button>
        </div>
      </div>
    </div>

    <!-- 채팅방 우클릭 컨텍스트 메뉴 -->
    <div v-if="contextMenu.show" class="context-menu" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }">
      <div class="context-item" @click="clearRoomMessages">대화 지우기</div>
      <div class="context-item" style="color:#e74c3c" @click="leaveRoom">나가기</div>
    </div>

    <!-- 메시지 우클릭 컨텍스트 메뉴 -->
    <div v-if="msgContextMenu.show" class="context-menu" :style="{ top: msgContextMenu.y + 'px', left: msgContextMenu.x + 'px' }">
      <div class="context-item" @click="copyMessage">복사</div>
      <div v-if="msgContextMenu.msg?.userId === currentUserId" class="context-item" style="color:#e74c3c" @click="deleteMessage">삭제</div>
    </div>

    <!-- 이미지 뷰어 -->
    <div v-if="viewImageUrl" class="modal-overlay" @click="viewImageUrl = ''">
      <img :src="viewImageUrl" style="max-width:90vw;max-height:90vh;border-radius:8px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { useChat, type ChatRoom, type ChatMessage, type ChatUser } from "../composables/useChat";

const API_BASE = window.location.port === "3000" ? "http://localhost:3200" : "/api";

const router = useRouter();
const chat = useChat();
const {
  currentUserId,
  currentUserNm,
  unreadCounts,
  connect,
  getRooms,
  createRoom,
  getUsers,
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
} = chat;

const rooms = ref<ChatRoom[]>([]);
const activeRoom = ref<ChatRoom | null>(null);
const messages = ref<ChatMessage[]>([]);
const inputText = ref("");
const searchQuery = ref("");
const typingUsers = ref<string[]>([]);
const onlineUsers = ref<string[]>([]);
const users = ref<ChatUser[]>([]);
const messagesEl = ref<HTMLElement | null>(null);
const isMobile = ref(window.innerWidth <= 768);
const uploadingFile = ref(false);

// 채팅방 만들기
const showCreateRoom = ref(false);
const newRoomName = ref("");
const newRoomType = ref("GROUP");

// 멤버 보기/초대
const showMembers = ref(false);
const roomMembers = ref<ChatUser[]>([]);
const showInvite = ref(false);
const inviteSearch = ref("");
const selectedUsers = ref<string[]>([]);
const currentMembers = ref<string[]>([]);

// 메시지 검색
const showSearch = ref(false);
const msgSearchQuery = ref("");
const msgSearchResults = ref<number[]>([]);
const msgSearchIdx = ref(0);
const searchTargetEl = ref<HTMLElement | null>(null);

// 채팅방 컨텍스트 메뉴
const contextMenu = reactive({ show: false, x: 0, y: 0, room: null as ChatRoom | null });

// 메시지 컨텍스트 메뉴
const msgContextMenu = reactive({ show: false, x: 0, y: 0, msg: null as ChatMessage | null });

// 이미지 뷰어
const viewImageUrl = ref("");


let unsubscribeRoom: (() => void) | null = null;

const DEPT_NAMES: Record<string, string> = {
  DEV: "개발팀",
  SALES: "영업팀",
  MGMT: "경영지원팀",
  PROD: "생산팀",
};

const filteredRooms = computed(() => {
  if (!searchQuery.value) return rooms.value;
  const q = searchQuery.value.toLowerCase();
  return rooms.value.filter((r) => r.ROOM_NM?.toLowerCase().includes(q));
});

const groupedUsers = computed(() => {
  const search = inviteSearch.value.toLowerCase();
  const filtered = search
    ? users.value.filter((u) => u.USER_NM.toLowerCase().includes(search) || u.USER_ID.toLowerCase().includes(search))
    : users.value;
  const deptMap = new Map<string, { deptCd: string; deptNm: string; users: ChatUser[]; open: boolean }>();
  for (const u of filtered) {
    const dc = u.DEPT_CD || "기타";
    if (!deptMap.has(dc)) deptMap.set(dc, { deptCd: dc, deptNm: DEPT_NAMES[dc] || dc, users: [], open: true });
    deptMap.get(dc)!.users.push(u);
  }
  return [...deptMap.values()];
});

const typingText = computed(() => typingUsers.value.length ? `${typingUsers.value.join(", ")} 입력 중...` : "");
const onlineText = computed(() => onlineUsers.value.length ? `${onlineUsers.value.length}명 접속중` : `${activeRoom.value?.MEMBER_COUNT ?? 0}명 참여`);

function shouldShowSender(i: number): boolean {
  const msg = messages.value[i];
  if (msg.userId === currentUserId.value) return false;
  if (i === 0) return true;
  return messages.value[i - 1].userId !== msg.userId;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function getUserName(uid: string): string {
  return users.value.find((u) => u.USER_ID === uid)?.USER_NM ?? uid;
}

function getFileUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url}`;
}

function toggleUser(uid: string) {
  if (uid === currentUserId.value || currentMembers.value.includes(uid)) return;
  const idx = selectedUsers.value.indexOf(uid);
  if (idx >= 0) selectedUsers.value.splice(idx, 1);
  else selectedUsers.value.push(uid);
}

// 채팅방 관리
async function loadRooms() {
  rooms.value = await getRooms();
}

function openCreateRoom() {
  newRoomName.value = "";
  newRoomType.value = "GROUP";
  showCreateRoom.value = true;
}

async function doCreateRoom() {
  if (!newRoomName.value.trim()) return;
  await createRoom(newRoomName.value, newRoomType.value, []);
  showCreateRoom.value = false;
  await loadRooms();
}

function openInvite() {
  selectedUsers.value = [];
  inviteSearch.value = "";
  currentMembers.value = activeRoom.value?.members ?? [];
  showInvite.value = true;
}

async function doInvite() {
  if (!activeRoom.value || !selectedUsers.value.length) return;
  const t = localStorage.getItem("ca_token") ?? "";
  await axios.post(
    `${API_BASE}/rooms/${activeRoom.value.ROOM_ID}/members`,
    { userIds: selectedUsers.value },
    { headers: { Authorization: `Bearer ${t}` } }
  );
  // 초대받은 사용자에게 실시간 알림
  notifyInvite(selectedUsers.value, activeRoom.value.ROOM_NM);
  showInvite.value = false;
  await loadRooms();
}

function onRoomContext(e: MouseEvent, room: ChatRoom) {
  contextMenu.show = true;
  contextMenu.x = e.clientX;
  contextMenu.y = e.clientY;
  contextMenu.room = room;
}

async function leaveRoom() {
  const room = contextMenu.room;
  contextMenu.show = false;
  if (!room) return;
  const token = localStorage.getItem("ca_token") ?? "";
  await axios.delete(
    `${API_BASE}/rooms/${room.ROOM_ID}/members/me`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (activeRoom.value?.ROOM_ID === room.ROOM_ID) activeRoom.value = null;
  await loadRooms();
}

// 대화 지우기 (내 화면에서만 삭제)
async function clearRoomMessages() {
  const room = contextMenu.room;
  contextMenu.show = false;
  if (!room) return;
  const t = localStorage.getItem("ca_token") ?? "";
  try {
    await axios.delete(
      `${API_BASE}/messages/${room.ROOM_ID}`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
  } catch {}
  // 메모리에서도 제거
  if (activeRoom.value?.ROOM_ID === room.ROOM_ID) {
    messages.value = [];
  }
  const r = rooms.value.find((r) => r.ROOM_ID === room.ROOM_ID);
  if (r) r.LAST_MSG = "";
}

// 채팅창 닫기 (방 나가기X, 대화 영역만 닫기)
function closeChat() {
  activeRoom.value = null;
  setActiveRoom(""); // 활성 방 초기화 → 알림 받을 수 있도록
}

// 메시지 우클릭
function onMsgContext(e: MouseEvent, msg: ChatMessage) {
  msgContextMenu.show = true;
  msgContextMenu.x = e.clientX;
  msgContextMenu.y = e.clientY;
  msgContextMenu.msg = msg;
}

// 메시지 복사
function copyMessage() {
  if (msgContextMenu.msg) {
    navigator.clipboard.writeText(msgContextMenu.msg.content).catch(() => {});
  }
  msgContextMenu.show = false;
}

// 메시지 삭제 (내 메시지만)
async function deleteMessage() {
  const msg = msgContextMenu.msg;
  msgContextMenu.show = false;
  if (!msg || msg.userId !== currentUserId.value) return;
  const t = localStorage.getItem("ca_token") ?? "";
  try {
    await axios.delete(
      `${API_BASE}/messages/${msg.roomId}/${msg.msgId}`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
  } catch {}
  messages.value = messages.value.filter((m) => m.msgId !== msg.msgId);
}

// 방 선택
async function selectRoom(room: ChatRoom) {
  if (unsubscribeRoom) unsubscribeRoom();
  activeRoom.value = room;
  typingUsers.value = [];
  onlineUsers.value = [];
  showMembers.value = false;
  showSearch.value = false;

  // 활성 방 설정 + 안읽음 초기화
  setActiveRoom(room.ROOM_ID);

  // 읽음 처리 + 히스토리 로드
  await markRead(room.ROOM_ID);
  await loadHistory(room.ROOM_ID);
  messages.value = getMessagesForRoom(room.ROOM_ID);

  const memberIds = room.members ?? [];
  roomMembers.value = memberIds.map((uid: string) => {
    const u = users.value.find((u) => u.USER_ID === uid);
    return u ?? { USER_ID: uid, USER_NM: uid, DEPT_CD: "" };
  });

  unsubscribeRoom = subscribeToRoom(
    room.ROOM_ID,
    (typing) => { typingUsers.value = typing; },
    (present) => { onlineUsers.value = present; },
  );

  await nextTick();
  scrollToBottom();
}

// 메시지 전송
function send() {
  const text = inputText.value.trim();
  if (!text || !activeRoom.value) return;
  inputText.value = "";
  sendMessage(activeRoom.value.ROOM_ID, text);
  nextTick(scrollToBottom);
}

function onTyping() {
  if (activeRoom.value) sendTyping(activeRoom.value.ROOM_ID);
}

// 파일 전송
async function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !activeRoom.value) return;

  uploadingFile.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("ca_token") ?? "";
    const res = await axios.post(`${API_BASE}/files/upload`, formData, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
    });
    const { fileName, fileUrl, msgType } = res.data;
    sendMessage(activeRoom.value.ROOM_ID, fileName, msgType, fileName, fileUrl);
  } catch (err) {
    console.error("[file] upload failed:", err);
  } finally {
    uploadingFile.value = false;
    (e.target as HTMLInputElement).value = "";
  }
}

function openImage(url: string) {
  viewImageUrl.value = getFileUrl(url);
}

// 메시지 검색
function searchMessages() {
  const q = msgSearchQuery.value.toLowerCase();
  if (!q) { msgSearchResults.value = []; return; }
  msgSearchResults.value = messages.value
    .map((m, i) => m.content?.toLowerCase().includes(q) ? i : -1)
    .filter((i) => i >= 0);
  msgSearchIdx.value = msgSearchResults.value.length - 1;
  scrollToSearchResult();
}

function nextSearchResult() {
  if (msgSearchIdx.value < msgSearchResults.value.length - 1) msgSearchIdx.value++;
  scrollToSearchResult();
}

function prevSearchResult() {
  if (msgSearchIdx.value > 0) msgSearchIdx.value--;
  scrollToSearchResult();
}

function scrollToSearchResult() {
  nextTick(() => {
    if (searchTargetEl.value) searchTargetEl.value.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function scrollToBottom() {
  if (messagesEl.value) {
    messagesEl.value.scrollTo({ top: messagesEl.value.scrollHeight, behavior: "smooth" });
  }
}

// 새 메시지 올 때 자동 스크롤 (스크롤이 맨 아래 근처일 때만)
function isNearBottom(): boolean {
  if (!messagesEl.value) return true;
  const { scrollTop, scrollHeight, clientHeight } = messagesEl.value;
  return scrollHeight - scrollTop - clientHeight < 100;
}

function autoScroll() {
  if (isNearBottom()) nextTick(scrollToBottom);
}

function logout() {
  localStorage.removeItem("ca_token");
  localStorage.removeItem("ca_user");
  disconnect();
  router.push("/login");
}

onMounted(async () => {
  window.addEventListener("resize", () => { isMobile.value = window.innerWidth <= 768; });
  window.addEventListener("click", () => { contextMenu.show = false; msgContextMenu.show = false; });
  const t = localStorage.getItem("ca_token");
  if (!t) { router.push("/login"); return; }

  try { await connect(); } catch (e) { console.warn("[chat] Ably connect failed:", e); }
  try { await loadRooms(); } catch (e) { console.warn("[chat] loadRooms failed:", e); }
  try { users.value = await getUsers(); } catch (e) { console.warn("[chat] getUsers failed:", e); }

  // 유저 채널 구독 — 초대 알림 시 방 목록 자동 갱신
  subscribeUserChannel(async () => {
    await loadRooms();
    // 새로 추가된 방도 구독
    subscribeAllRooms(rooms.value, (roomId, msg) => {
      if (activeRoom.value?.ROOM_ID === roomId) {
        messages.value = getMessagesForRoom(roomId);
        autoScroll();
      }
      const r = rooms.value.find((r) => r.ROOM_ID === roomId);
      if (r) r.LAST_MSG = msg.content;
    }, async (roomId) => {
      if (activeRoom.value?.ROOM_ID === roomId) {
        messages.value = await refreshUnreadCounts(roomId);
      }
    });
  });

  // 백그라운드 메시지 수신 + 안읽음 추적 + 읽음 실시간 갱신
  subscribeAllRooms(
    rooms.value,
    // 새 메시지 수신
    (roomId, msg) => {
      if (activeRoom.value?.ROOM_ID === roomId) {
        messages.value = getMessagesForRoom(roomId);
        autoScroll();
      }
      const r = rooms.value.find((r) => r.ROOM_ID === roomId);
      if (r) r.LAST_MSG = msg.content;
    },
    // 읽음 이벤트 수신 → 현재 보고 있는 방이면 unreadCount 새로고침
    async (roomId) => {
      if (activeRoom.value?.ROOM_ID === roomId) {
        messages.value = await refreshUnreadCounts(roomId);
      }
    },
  );
});

onUnmounted(() => {
  if (unsubscribeRoom) unsubscribeRoom();
});
</script>

<style scoped>
.msg-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #999;
  margin-top: 2px;
  padding: 0 4px;
}
.msg-meta[style*="right"] { justify-content: flex-end; }
.msg-unread {
  color: #4A90D9;
  font-weight: 700;
  font-size: 11px;
}
.msg-time-text {
  color: #999;
}

.header-btn {
  background: none;
  border: 1px solid #ddd;
  padding: 4px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.header-btn:hover { background: #f5f5f5; }

.attach-btn {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 20px; border-radius: 50%;
}
.attach-btn:hover { background: #f0f0f0; }

.msg-image {
  max-width: 240px;
  max-height: 180px;
  border-radius: 8px;
  cursor: pointer;
}

.msg-file {
  color: inherit;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.msg-file:hover { text-decoration: underline; }

.msg-highlight {
  outline: 2px solid #f1c40f;
  outline-offset: 2px;
}

.search-bar {
  padding: 8px 16px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-bar-input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 16px;
  font-size: 13px;
  outline: none;
}
.search-bar-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  color: #666;
}

.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 200;
  min-width: 120px;
}
.context-item {
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
}
.context-item:hover { background: #f5f5f5; }

/* Member Panel */
.member-panel {
  border-bottom: 1px solid #eee;
  background: #fafafa;
  max-height: 240px;
  overflow-y: auto;
}
.member-panel-header {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
}
.member-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
}
.member-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: #ccc;
  color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; flex-shrink: 0;
  position: relative;
}
.member-avatar.online { background: #4A90D9; }
.member-avatar.online::after {
  content: '';
  position: absolute; bottom: -1px; right: -1px;
  width: 10px; height: 10px;
  background: #2ecc71; border-radius: 50%; border: 2px solid #fafafa;
}
.member-info { flex: 1; }
.member-name { font-size: 13px; font-weight: 500; }
.member-dept { font-size: 11px; color: #999; }
.member-online-badge {
  font-size: 11px; color: #2ecc71; background: #e8faf0;
  padding: 2px 8px; border-radius: 10px;
}

/* Modal */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal-card {
  background: white; border-radius: 12px; width: 360px;
  max-height: 80vh; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.modal-header {
  padding: 16px 20px; font-weight: 600; font-size: 16px;
  border-bottom: 1px solid #eee;
  display: flex; justify-content: space-between; align-items: center;
}
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #999; }
.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.modal-footer {
  padding: 12px 20px; border-top: 1px solid #eee;
  display: flex; gap: 8px; justify-content: flex-end;
}
.modal-input {
  width: 100%; padding: 10px 14px;
  border: 1px solid #ddd; border-radius: 8px;
  font-size: 14px; outline: none;
}
.modal-input:focus { border-color: #4A90D9; }
.modal-btn-cancel { padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 8px; cursor: pointer; }
.modal-btn-ok { padding: 8px 16px; border: none; background: #4A90D9; color: white; border-radius: 8px; cursor: pointer; font-weight: 600; }
.modal-btn-ok:disabled { opacity: 0.5; cursor: not-allowed; }

/* Org Tree */
.org-tree { margin-top: 12px; max-height: 300px; overflow-y: auto; }
.org-dept { margin-bottom: 4px; }
.org-dept-header {
  padding: 8px; cursor: pointer; display: flex; align-items: center;
  gap: 8px; font-size: 13px; font-weight: 600; color: #555; border-radius: 6px;
}
.org-dept-header:hover { background: #f5f5f5; }
.org-dept-name { flex: 1; }
.org-dept-count { font-size: 12px; color: #999; font-weight: 400; }
.org-dept-users { padding-left: 12px; }
.org-user {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px; cursor: pointer; border-radius: 6px; transition: background 0.15s;
}
.org-user:hover { background: #f0f5ff; }
.org-user.selected { background: #e8f0fe; }
.org-user.disabled { opacity: 0.4; cursor: not-allowed; }
.org-user-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: #4A90D9; color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; flex-shrink: 0;
}
.org-user-info { flex: 1; }
.org-user-name { font-size: 13px; font-weight: 500; }
.org-user-id { font-size: 11px; color: #999; }
.org-user-check { color: #4A90D9; font-weight: 700; }
.org-user-tag { font-size: 11px; color: #999; background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
.selected-tags {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;
}
.selected-tag {
  background: #e8f0fe; color: #4A90D9;
  padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 500;
}
</style>
