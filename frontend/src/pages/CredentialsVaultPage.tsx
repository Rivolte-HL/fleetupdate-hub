import React, { useEffect, useState } from 'react';
import { hostsService } from '../services/hosts.service.js';
import { useToast } from '../context/ToastContext.js';
import { useLanguage } from '../context/LanguageContext.js';
import { Lock, RefreshCw } from 'lucide-react';
import { Badge } from '../components/Badge.js';

export const CredentialsVaultPage: React.FC = () => {
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const { t } = useLanguage();

  const loadVault = async () => {
    try {
      setLoading(true);
      const data = await hostsService.getVaultCredentials();
      setCredentials(data);
    } catch (err: any) {
      addToast('error', t('common.error'), err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVault();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-white tracking-tight">{t('vault.title')}</h2>
            <Badge variant="success" size="sm">{t('hostDetail.vaultEncrypted')}</Badge>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">{t('vault.subtitle')}</p>
        </div>

        <button
          onClick={loadVault}
          className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-cyan-400 border border-slate-700 transition-colors self-start sm:self-auto"
          title={t('common.refresh')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="glass-panel p-5 rounded-2xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-200 flex items-start gap-3">
        <Lock className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Zero-Trust Cryptographic Storage :</span> {t('vault.subtitle')}
        </div>
      </div>

      {/* Credentials List */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-5">{t('vault.selectHost')}</th>
                <th className="py-3.5 px-5">{t('vault.authType')}</th>
                <th className="py-3.5 px-5">{t('vault.fingerprint')}</th>
                <th className="py-3.5 px-5">Algorithm</th>
                <th className="py-3.5 px-5">{t('vault.updatedAt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">{t('common.loading')}</td>
                </tr>
              ) : credentials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">{t('vault.noCredentials')}</td>
                </tr>
              ) : (
                credentials.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 px-5 font-semibold text-white">
                      {c.host?.name}
                      <div className="text-[10px] text-slate-500 font-mono">{c.host?.adapterType}</div>
                    </td>
                    <td className="py-4 px-5">
                      <Badge variant="brand" size="sm">{c.authType}</Badge>
                    </td>
                    <td className="py-4 px-5 font-mono text-cyan-300">
                      {c.keyFingerprint || '••••••••••••••••'}
                    </td>
                    <td className="py-4 px-5 font-mono text-emerald-400 text-[11px]">
                      AES-256-GCM + IV(96b) + Tag(128b)
                    </td>
                    <td className="py-4 px-5 text-slate-400">
                      {new Date(c.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
