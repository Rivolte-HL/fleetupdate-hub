import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { useLanguage } from '../context/LanguageContext.js';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Mail, KeyRound, ArrowRight, ShieldCheck, ChevronLeft } from 'lucide-react';
import { LanguageSelector } from '../components/LanguageSelector.js';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { addToast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await login(email, password, requires2FA ? totpCode : undefined);
      if (res.requiresTwoFactor) {
        setRequires2FA(true);
        addToast('info', t('auth.totpRequired'), t('auth.totpHelper'));
      } else if (res.user) {
        addToast('success', t('auth.loginSuccess'), `Welcome ${res.user.name || res.user.email}`);
        navigate('/');
      }
    } catch (err: any) {
      addToast('error', t('auth.loginError'), err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Top right language switcher */}
      <div className="absolute top-5 right-5 z-20">
        <LanguageSelector />
      </div>

      {/* Background Glow */}
      <div className="absolute w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none -top-20 -left-20" />
      <div className="absolute w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -bottom-20 -right-20" />

      <div className="glass-panel-glow w-full max-w-md p-8 rounded-3xl space-y-6 shadow-2xl relative z-10 border border-slate-800/80">
        {/* Header */}
        <div className="text-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/25 border border-cyan-400/30 mx-auto">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">{t('common.appName')}</h2>
            <p className="text-xs text-slate-400 mt-1">
              {t('auth.loginSubtitle')}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!requires2FA ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('auth.emailLabel')}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500/50 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('auth.passwordLabel')}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    placeholder={t('auth.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500/50 outline-none transition-colors"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-cyan-400" /> {t('auth.totpLabel')}
                </label>
                <button
                  type="button"
                  onClick={() => setRequires2FA(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> {t('auth.backToLogin')}
                </button>
              </div>
              <input
                type="text"
                required
                autoFocus
                placeholder={t('auth.totpPlaceholder')}
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-cyan-500/50 text-center font-mono text-2xl tracking-widest text-cyan-300 focus:border-cyan-400 outline-none shadow-lg shadow-cyan-950/40"
              />
              <p className="text-[11px] text-slate-400 text-center">
                {t('auth.totpHelper')}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>{loading ? t('auth.authenticating') : requires2FA ? t('auth.validateTotp') : t('auth.loginButton')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px]">{t('common.zeroTrustShield')}</span>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>
    </div>
  );
};

