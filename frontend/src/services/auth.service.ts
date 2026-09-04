import { api } from "./api.js";
import { User, AuditLog } from "../types/index.js";

export const authService = {
  async login(credentials: { email: string; password: string; totpCode?: string }) {
    const res = await api.post<{ user?: User; requiresTwoFactor?: boolean; message?: string }>("/auth/login", credentials);
    return res.data;
  },

  async logout() {
    const res = await api.post("/auth/logout");
    return res.data;
  },

  async getMe() {
    const res = await api.get<{ user: User }>("/auth/me");
    return res.data.user;
  },

  async changePassword(passwords: { currentPassword: string; newPassword: string }) {
    const res = await api.post<{ message: string }>("/auth/change-password", passwords);
    return res.data;
  },

  async setup2FA() {
    const res = await api.post<{ secret: string; qrCodeUrl: string; message: string }>("/auth/2fa/setup");
    return res.data;
  },

  async enable2FA(code: string) {
    const res = await api.post<{ message: string }>("/auth/2fa/enable", { code });
    return res.data;
  },

  async getAuditLogs(params?: { limit?: number; action?: string; resourceType?: string }) {
    const res = await api.get<{ logs: AuditLog[] }>("/audit", { params });
    return res.data.logs;
  }
};
