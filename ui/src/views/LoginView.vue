<template>
  <div class="login-wrapper">
    <div class="login-card">
      <div class="login-logo">CA Messenger</div>
      <form @submit.prevent="login">
        <div class="input-group">
          <label>아이디</label>
          <input v-model="userId" type="text" placeholder="ERP 아이디 입력" autofocus />
        </div>
        <div class="input-group">
          <label>비밀번호</label>
          <input v-model="password" type="password" placeholder="비밀번호 입력" />
        </div>
        <div v-if="error" class="error-msg">{{ error }}</div>
        <button type="submit" :disabled="loading" class="login-btn">
          {{ loading ? '로그인 중...' : '로그인' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import axios from "axios";
import { useRouter } from "vue-router";

const router = useRouter();
const userId = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function login() {
  if (!userId.value || !password.value) {
    error.value = "아이디와 비밀번호를 입력하세요";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const isElectron = window.location.protocol === "file:" || !!(window as any).electronAPI;
    const apiBase = isElectron || window.location.port === "3000" ? "http://localhost:3200" : "/api";
    const res = await axios.post(`${apiBase}/auth/login`, {
      userId: userId.value,
      password: password.value,
    });

    localStorage.setItem("ca_token", res.data.token);
    localStorage.setItem("ca_user", JSON.stringify(res.data.user));
    router.push("/");
  } catch (err: any) {
    error.value = err.response?.data?.error ?? "로그인에 실패했습니다";
  } finally {
    loading.value = false;
  }
}
</script>
