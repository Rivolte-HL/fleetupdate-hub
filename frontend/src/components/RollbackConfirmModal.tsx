import React from 'react';
import { Host, BackupRecord } from '../types/index.js';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.js';

interface RollbackConfirmModalProps {
  host: Host;
  backup: BackupRecord;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

export const RollbackConfirmModal: React.FC<RollbackConfirmModalProps> = ({
  host,
  backup,
  onConfirm,
  onClose,
  loading = false
}) => {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel w-full max-w-md rounded-3xl border border-rose-500/30 overflow-hidden shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{t('rollback.modalTitle')}</h3>
            <p className="text-xs text-slate-400">{t('rollback.modalSubtitle')}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/40 text-xs text-rose-200 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-rose-400">
            <AlertTriangle className="w-4 h-4" /> {t('rollback.warningTitle')}
          </div>
          <p className="leading-relaxed">
            {t('rollback.warningBody', { name: host.name })}
          </p>
          <div className="p-2 rounded-lg bg-black/50 font-mono text-cyan-300 border border-slate-800 text-[11px] truncate">
            {backup.snapshotIdentifier} ({backup.backupType})
          </div>
          <p className="text-[11px] text-slate-400">
            {t('rollback.createdAt')} {new Date(backup.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{loading ? t('rollback.executing') : t('rollback.executeRollback')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
