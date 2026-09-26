import { api } from './api.js';
import { UpdateTask } from '../types/index.js';

export const updatesService = {
  async getTasks(params?: { hostId?: string; limit?: number }) {
    const res = await api.get<{ tasks: UpdateTask[] }>('/updates/tasks', { params });
    return res.data.tasks;
  },

  async getTaskById(id: string) {
    const res = await api.get<{ task: UpdateTask }>(`/updates/tasks/${id}`);
    return res.data.task;
  },

  async triggerUpdate(data: { hostId: string; autoRollback?: boolean }) {
    const res = await api.post<{ task: UpdateTask; message: string }>('/updates/trigger', data);
    return res.data;
  },

  async triggerRollback(data: { hostId: string; backupRecordId: string }) {
    const res = await api.post<{ message: string }>('/updates/rollback', data);
    return res.data;
  }
};
