<script setup lang="ts">
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { NButton, NForm, NFormItem, NInput, NTabPane, NTabs, useMessage } from "naive-ui"

import { useAuthStore } from "@/stores/auth"
import { ApiClientError } from "@/api/client"

/**
 * 登录 / 注册页（双 Tab）。
 * 注册成功自动登录；支持 ?redirect= 回跳登录前页面。
 */

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const message = useMessage()

const tab = ref<"login" | "register">("login")
const submitting = ref(false)

// 登录表单
const loginForm = ref({ phone: "", password: "" })

// 注册表单
const registerForm = ref({ phone: "", nickname: "", password: "", confirmPassword: "" })

/** 把后端错误转成用户能懂的话（错误 code 见 identity 模块 README） */
function friendlyError(e: unknown): string {
  if (e instanceof ApiClientError) {
    const code = e.body?.code ?? ""
    if (code === "InvalidCredentials") return "手机号或密码错误"
    if (code === "PhoneAlreadyRegistered") return "该手机号已注册，请直接登录"
    if (code === "InvalidPassword") return e.body?.message || "密码强度不足"
    if (code === "InvalidPhoneNumber") return "手机号格式不正确"
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

function afterAuth() {
  message.success(`欢迎，${auth.nickname || "摄影师"}`)
  const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/"
  void router.push(redirect)
}

function validatePhone(phone: string): string | null {
  return /^1\d{10}$/.test(phone) ? null : "请输入 11 位手机号"
}

async function doLogin() {
  const err = validatePhone(loginForm.value.phone)
  if (err) return message.error(err)
  if (loginForm.value.password.length < 6) return message.error("请输入密码")
  submitting.value = true
  try {
    await auth.login(loginForm.value)
    afterAuth()
  } catch (e) {
    message.error(friendlyError(e))
  } finally {
    submitting.value = false
  }
}

async function doRegister() {
  const err = validatePhone(registerForm.value.phone)
  if (err) return message.error(err)
  if (!registerForm.value.nickname.trim()) return message.error("请填写昵称")
  if (registerForm.value.password.length < 6) return message.error("密码至少 6 位")
  if (registerForm.value.password !== registerForm.value.confirmPassword) {
    return message.error("两次输入的密码不一致")
  }
  submitting.value = true
  try {
    await auth.register({
      phone: registerForm.value.phone,
      nickname: registerForm.value.nickname.trim(),
      password: registerForm.value.password,
    })
    afterAuth()
  } catch (e) {
    message.error(friendlyError(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page login-page">
    <div class="login-card">
      <h2 class="page-title">欢迎来到摄影团团圈</h2>
      <p class="page-sub">登录后参团、付订金、管理报名</p>

      <n-tabs v-model:value="tab" type="segment" :animated="true">
        <n-tab-pane name="login" tab="登录">
          <n-form label-placement="top" class="login-form">
            <n-form-item label="手机号">
              <n-input v-model:value="loginForm.phone" placeholder="11 位手机号" maxlength="11" />
            </n-form-item>
            <n-form-item label="密码">
              <n-input
                v-model:value="loginForm.password"
                type="password"
                show-password-on="click"
                placeholder="密码"
                @keydown.enter="doLogin"
              />
            </n-form-item>
            <n-button type="primary" block :loading="submitting" @click="doLogin">登录</n-button>
          </n-form>
        </n-tab-pane>

        <n-tab-pane name="register" tab="注册">
          <n-form label-placement="top" class="login-form">
            <n-form-item label="手机号">
              <n-input v-model:value="registerForm.phone" placeholder="11 位手机号" maxlength="11" />
            </n-form-item>
            <n-form-item label="昵称">
              <n-input v-model:value="registerForm.nickname" placeholder="大家在团里怎么称呼你" />
            </n-form-item>
            <n-form-item label="密码">
              <n-input
                v-model:value="registerForm.password"
                type="password"
                show-password-on="click"
                placeholder="至少 6 位"
              />
            </n-form-item>
            <n-form-item label="确认密码">
              <n-input
                v-model:value="registerForm.confirmPassword"
                type="password"
                show-password-on="click"
                placeholder="再输一次"
                @keydown.enter="doRegister"
              />
            </n-form-item>
            <n-button type="primary" block :loading="submitting" @click="doRegister">
              注册并登录
            </n-button>
          </n-form>
        </n-tab-pane>
      </n-tabs>

      <p class="login-hint">暂未接短信验证码与微信登录，先用手机号 + 密码注册体验</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  padding-top: 40px;
}

.login-card {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-form {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.login-hint {
  font-size: 12px;
  color: #8a968f;
  text-align: center;
}
</style>
