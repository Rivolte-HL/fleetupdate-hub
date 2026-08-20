import { api } from './api.js';
import { Host, AdapterMetadata, ChangelogItem } from '../types/index.js';

export const hostsService = {
  async getHosts() {
    const res = await api.get<{ hosts: Host[] }>('/hosts');
    return res.data.hosts;
  },

  async getHostById(id: string) {
    const res = await api.get<{ host: Host }>(`/hosts/${id}`);
    return res.data.host;
  },

  async createHost(data: any) {
    const res = await api.post<{ host: Host; message: string }>('/hosts', data);
    return res.data;
  },

  async updateHost(id: string, data: any) {
    const res = await api.put<{ host: Host; message: string }>(`/hosts/${id}`, data);
    return res.data;
  },

  async deleteHost(id: string) {
    const res = await api.delete<{ message: string }>(`/hosts/${id}`);
    return res.data;
  },

  async refreshVersion(id: string) {
    const res = await api.post<{ host: Host; versionInfo: any }>(`/hosts/${id}/refresh`);
    return res.data;
  },

  async refreshAll() {
    const res = await api.post<{ message: string; hosts: Host[]; summary?: any }>('/hosts/refresh-all');
    return res.data;
  },

  async getChangelog(id: string) {
    const res = await api.get<{ changelog: ChangelogItem[] }>(`/hosts/${id}/changelog`);
    return res.data.changelog;
  },

  async getAdapters() {
    const res = await api.get<{ adapters: AdapterMetadata[] }>('/adapters');
    return res.data.adapters;
  },

  async getVaultCredentials() {
    const res = await api.get<{ credentials: any[] }>('/vault');
    return res.data.credentials;
  },

  async rotateCredential(data: { hostId: string; credentials: any }) {
    const res = await api.post<{ message: string }>('/vault/rotate', data);
    return res.data;
  }
};
