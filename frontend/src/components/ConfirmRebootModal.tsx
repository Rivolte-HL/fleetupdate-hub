import React, { useState } from 'react';
import { Host } from '../types/index.js';
import { RotateCcw, AlertTriangle, X, ShieldAlert } from 'lucide-react';

interface ConfirmRebootModalProps {
  host: Host;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const ConfirmRebootModal: React.FC<ConfirmRebootModalProps> = ({
  host,
  onClose,
  onConfirm
}) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel-glow w-full max-w-md rounded-3xl border border-amber-500/30 overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Redémarrage de l'hôte</h3>
              <p className="text-xs text-slate-400">Confirmation d'action d'administration</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Interruption temporaire de service</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Êtes-vous sûr de vouloir envoyer l'ordre de redémarrage à l'hôte <strong className="text-white">{host.name}</strong> ({host.adapterType}) ?
            </p>
            <p className="text-slate-400 text-[11px]">
              La machine sera temporairement injoignable le temps du cycle de démarrage. Une fois le système relancé, le statut de redémarrage s'éteindra automatiquement.
            </p>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-slate-500" />
            <span>Action journalisée dans le registre d'audit avec votre compte.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Redémarrage...' : 'Confirmer le redémarrage'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
