import React from 'react';
import { ChangelogItem, Host } from '../types/index.js';
import { FileText, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { Badge } from './Badge.js';

interface ChangelogViewerModalProps {
  host: Host;
  changelog: ChangelogItem[];
  onClose: () => void;
}

export const ChangelogViewerModal: React.FC<ChangelogViewerModalProps> = ({
  host,
  changelog,
  onClose
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel w-full max-w-2xl rounded-3xl border border-slate-700 overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Release Notes & Changelog</h3>
              <p className="text-xs text-slate-400">
                Hôte: <span className="text-slate-200 font-semibold">{host.name}</span> ({host.adapterType})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {changelog.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              Aucun changelog spécifique disponible pour cet équipement.
            </div>
          ) : (
            changelog.map((item, index) => (
              <div
                key={index}
                className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-cyan-300 font-mono">{item.version}</span>
                    {item.isSecurityFix && (
                      <Badge variant="danger" size="sm">
                        <ShieldCheck className="w-3 h-3" /> Correctif de Sécurité
                      </Badge>
                    )}
                  </div>
                  {item.releaseDate && (
                    <span className="text-xs text-slate-500">{item.releaseDate}</span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{item.summary}</p>

                {item.detailsUrl && (
                  <div className="pt-2">
                    <a
                      href={item.detailsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:underline font-medium"
                    >
                      <span>Consulter la source officielle</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
