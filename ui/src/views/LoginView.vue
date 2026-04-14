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
    const apiBase = window.location.port === "3000" ? "http://localhost:3200" : "/api";
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

<style scoped>
.login-wrapper {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2c3e50 0%, #4A90D9 100%);
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 40px;
  width: 380px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.login-logo {
  text-align: center;
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 32px;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 6px;
}

.input-group input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border 0.2s;
}

.input-group input:focus {
  border-color: #4A90D9;
}

.error-msg {
  color: #e74c3c;
  font-size: 13px;
  margin-bottom: 12px;
  text-align: center;
}

.login-btn {
  width: 100%;
  padding: 12px;
  background: #4A90D9;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.login-btn:hover { background: #3a7bc8; }
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
