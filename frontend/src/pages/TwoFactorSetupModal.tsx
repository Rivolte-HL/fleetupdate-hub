import React, { useState, useEffect } from 'react';
import { authService } from '../services/auth.service.js';
import { useToast } from '../context/ToastContext.js';
import { useLanguage } from '../context/LanguageContext.js';
import { ShieldCheck, X } from 'lucide-react';

interface TwoFactorSetupModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const TwoFactorSetupModal: React.FC<TwoFactorSetupModalProps> = ({ onClose, onSuccess }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const { addToast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    const init2FA = async () => {
      try {
        setLoading(true);
        const data = await authService.setup2FA();
        setQrCodeUrl(data.qrCodeUrl);
        setSecret(data.secret);
      } catch (err: any) {
        addToast('error', t('common.error'), err.message);
        onClose();
      } finally {
        setLoading(false);
      }
    };
    init2FA();
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setVerifying(true);
      await authService.enable2FA(code);
      addToast('success', t('common.success'), t('auth.twoFactorEnabledSuccess'));
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast('error', t('common.error'), err.response?.data?.message || err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel w-full max-w-md rounded-3xl border border-cyan-500/30 overflow-hidden shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t('nav.setup2fa')}</h3>
              <p className="text-xs text-slate-400">{t('auth.loginSubtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-xs text-slate-400">{t('common.loading')}</div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white flex items-center justify-center mx-auto w-48 h-48">
              {qrCodeUrl && <img src={qrCodeUrl} alt="2FA QR Code" className="w-full h-full" />}
            </div>

            <div className="text-center space-y-1">
              <p className="text-xs text-slate-300">
                {t('auth.totpHelper')}
              </p>
              <div className="text-[11px] font-mono text-cyan-300 select-all">
                Manual Key: {secret}
              </div>
            </div>

            <form onSubmit={handleVerify} className="space-y-3 pt-2">
              <input
                type="text"
                required
                placeholder={t('auth.totpPlaceholder')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center font-mono text-lg text-cyan-300 focus:border-cyan-500 outline-none"
              />
              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md disabled:opacity-50"
              >
                {verifying ? t('common.loading') : t('auth.validateTotp')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
