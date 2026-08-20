import React, { useState } from 'react';
import {
  X,
  Server,
  Copy,
  Check,
  BookOpen,
  Key,
  ShieldAlert,
  Info
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.js';
import { tutorialsFr, tutorialsEn } from '../data/tutorials.data.js';

interface ServiceTutorialModalProps {
  initialService?: string;
  onClose: () => void;
}

export const ServiceTutorialModal: React.FC<ServiceTutorialModalProps> = ({
  initialService = 'PROXMOX',
  onClose
}) => {
  const [activeService, setActiveService] = useState<string>(initialService);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const { language, t } = useLanguage();
  const isFr = language === 'fr';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const tutorials = isFr ? tutorialsFr : tutorialsEn;
  const currentTutorial = tutorials[activeService] || tutorials['PROXMOX'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel-glow w-full max-w-4xl rounded-3xl border border-cyan-500/30 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {isFr ? "Guides & Tutoriels d'Intégration" : "Integration Guides & Tutorials"}
              </h3>
              <p className="text-xs text-slate-400">
                {isFr ? "Instructions détaillées, commandes prêtes à l'emploi et bonnes pratiques" : "Step-by-step instructions, ready-to-run setup commands and security best practices"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Service Selector Tabs */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 overflow-x-auto flex gap-2 shrink-0">
          {Object.values(tutorials).map((tut) => {
            const Icon = tut.icon;
            const isActive = activeService === tut.id;
            return (
              <button
                key={tut.id}
                onClick={() => setActiveService(tut.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-md shadow-cyan-500/10'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${tut.color}`} />
                <span>{tut.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {/* Service Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 shrink-0">
                <currentTutorial.icon className={`w-6 h-6 ${currentTutorial.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-white">{currentTutorial.name}</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    {currentTutorial.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{currentTutorial.summary}</p>
              </div>
            </div>
          </div>

          {/* Steps List */}
          <div className="space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Key className="w-4 h-4" /> {isFr ? "Étapes de Configuration sur l'Équipement Cible" : "Configuration Steps on Target System"}
            </h5>

            {currentTutorial.steps.map((step, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2.5"
              >
                <h6 className="text-xs font-bold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center text-[10px] font-mono">
                    {idx + 1}
                  </span>
                  {step.title}
                </h6>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                  {step.description}
                </p>

                {step.command && (
                  <div className="relative mt-2">
                    <pre className="p-3 rounded-xl bg-black/70 border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto">
                      <code>{step.command}</code>
                    </pre>
                    <button
                      onClick={() => copyToClipboard(step.command!, `cmd-${idx}`)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all flex items-center gap-1 text-[10px] cursor-pointer"
                      title={isFr ? "Copier la commande" : "Copy command"}
                    >
                      {copiedIndex === `cmd-${idx}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">{isFr ? "Copié" : "Copied"}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{isFr ? "Copier" : "Copy"}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {step.tip && (
                  <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-300 flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
                    <span>{step.tip}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Form Fields Mapping Guide */}
          <div className="space-y-3 pt-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Server className="w-4 h-4" /> {isFr ? "Correspondance des Champs dans FleetUpdate-Hub" : "FleetUpdate-Hub Field Mapping"}
            </h5>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                  <tr>
                    <th className="p-3">{isFr ? "Champ dans l'interface" : "UI Field"}</th>
                    <th className="p-3">{isFr ? "Exemple de valeur" : "Example Value"}</th>
                    <th className="p-3">{isFr ? "Description & Rôle" : "Description"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {currentTutorial.formFieldsGuide.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-800/30">
                      <td className="p-3 font-semibold text-white">{item.field}</td>
                      <td className="p-3 font-mono text-cyan-400 text-[11px]">{item.example}</td>
                      <td className="p-3 text-slate-400 text-xs">{item.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            {isFr ? "Secrets et clés chiffrés automatiquement en AES-256-GCM" : "Secrets & credentials automatically encrypted in AES-256-GCM"}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
