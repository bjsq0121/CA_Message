import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import LoginView from "./views/LoginView.vue";
import ChatView from "./views/ChatView.vue";
import "./assets/style.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/", component: ChatView },
    { path: "/room/:roomId", component: ChatView, props: true },
  ],
});

// 로그인 가드
router.beforeEach((to) => {
  const token = localStorage.getItem("ca_token");
  if (!token && to.path !== "/login") return "/login";
  if (token && to.path === "/login") return "/";
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
