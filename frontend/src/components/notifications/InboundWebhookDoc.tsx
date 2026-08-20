import React from 'react';
import { Terminal, Home, Copy, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.js';

interface InboundWebhookDocProps {
  publicUrl: string;
  webhookSecret: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

export const InboundWebhookDoc: React.FC<InboundWebhookDocProps> = ({
  publicUrl,
  webhookSecret,
  copiedKey,
  onCopy
}) => {
  const { t } = useLanguage();

  const haYamlContent = `rest_command:
  fleetupdate_trigger_all:
    url: "${publicUrl || 'https://update.domain.com'}/api/webhooks/action?secret=${webhookSecret || 'YOUR_SECRET'}"
    method: POST
    content_type: "application/json"
    payload: '{"action":"TRIGGER_UPDATE_ALL"}'`;

  const curlContent = `curl -X POST "${publicUrl || 'https://update.domain.com'}/api/webhooks/action" \\
  -H "Authorization: Bearer ${webhookSecret || 'YOUR_SECRET'}" \\
  -H "Content-Type: application/json" \\
  -d '{"action": "TRIGGER_UPDATE_ALL"}'`;

  return (
    <div className="glass-card p-6 rounded-2xl border border-slate-700/60 bg-slate-900/40 space-y-4 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          <Terminal className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-base text-white">{t('notifications.docTitle')}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('notifications.docDesc')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        {/* Home Assistant YAML */}
        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" /> Home Assistant Action Trigger (configuration.yaml)
            </span>
            <button
              onClick={() => onCopy(haYamlContent, 'haYaml')}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              {copiedKey === 'haYaml' ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>Copier</span>
            </button>
          </div>
          <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto p-3 bg-slate-900/80 rounded-lg">
            {haYamlContent}
          </pre>
        </div>

        {/* cURL / Talk Trigger */}
        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" /> Direct cURL / Bot Trigger
            </span>
            <button
              onClick={() => onCopy(curlContent, 'curlCode')}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              {copiedKey === 'curlCode' ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>Copier</span>
            </button>
          </div>
          <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto p-3 bg-slate-900/80 rounded-lg">
            {curlContent}
          </pre>
        </div>
      </div>
    </div>
  );
};
