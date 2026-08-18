import React, { useState } from 'react';
import { AdapterMetadata, FormFieldDefinition } from '../types/index.js';
import { Shield, Key, Server, HelpCircle, BookOpen } from 'lucide-react';
import { ServiceTutorialModal } from './ServiceTutorialModal.js';

interface DynamicAdapterFormProps {
  adapter: AdapterMetadata;
  initialValues?: {
    name?: string;
    description?: string;
    endpointUrl?: string;
    port?: number;
    metadata?: Record<string, any>;
    credentials?: Record<string, any>;
  };
  isEdit?: boolean;
  onSubmit: (formData: any) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const DynamicAdapterForm: React.FC<DynamicAdapterFormProps> = ({
  adapter,
  initialValues,
  isEdit = false,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [showTutorial, setShowTutorial] = useState(false);
  const [name, setName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [endpointUrl, setEndpointUrl] = useState(initialValues?.endpointUrl || '');
  const [port, setPort] = useState<string>(initialValues?.port ? String(initialValues.port) : '');

  // Dynamic state for adapter connection metadata & credentials
  const [metadataValues, setMetadataValues] = useState<Record<string, any>>(initialValues?.metadata || {});
  const [credentialValues, setCredentialValues] = useState<Record<string, any>>(initialValues?.credentials || {});

  const handleMetadataChange = (fieldName: string, value: any) => {
    setMetadataValues(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleCredentialChange = (fieldName: string, value: any) => {
    setCredentialValues(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out blank credentials when editing so we don't wipe existing vault entries
    const cleanedCredentials: Record<string, any> = {};
    Object.entries(credentialValues).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        cleanedCredentials[k] = v;
      }
    });

    await onSubmit({
      name,
      description,
      adapterType: adapter.type,
      endpointUrl,
      port: port ? parseInt(port, 10) : undefined,
      metadata: metadataValues,
      credentials: cleanedCredentials
    });
  };

  const renderField = (field: FormFieldDefinition, isCred: boolean) => {
    const value = isCred
      ? credentialValues[field.name] ?? field.defaultValue ?? ''
      : metadataValues[field.name] ?? field.defaultValue ?? '';

    const onChange = (newVal: any) => {
      if (isCred) handleCredentialChange(field.name, newVal);
      else handleMetadataChange(field.name, newVal);
    };

    const isRequired = isCred && isEdit ? false : field.required;
    const placeholder = isCred && isEdit
      ? 'Laisser vide pour conserver le secret actuel'
      : field.placeholder;

    return (
      <div key={field.name} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300">
            {field.label} {isRequired && <span className="text-rose-400">*</span>}
          </label>
          {field.description && (
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <HelpCircle className="w-3 h-3" /> {field.description}
            </span>
          )}
        </div>

        {field.type === 'select' ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={isRequired}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={isRequired}
            placeholder={placeholder}
            rows={3}
            className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
          />
        ) : field.type === 'boolean' ? (
          <label className="flex items-center gap-2.5 cursor-pointer py-1.5">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
            />
            <span className="text-xs text-slate-300">{field.description || field.label}</span>
          </label>
        ) : (
          <input
            type={field.type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={isRequired}
            placeholder={placeholder}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none font-mono"
          />
        )}
      </div>
    );
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Help & Tutorial Banner for this service */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 shadow-sm shadow-cyan-500/5">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs text-cyan-200 truncate">
              Guide de configuration & privilèges : <strong>{adapter.displayName}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-all shrink-0 hover:scale-[1.02]"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Voir le Tuto</span>
          </button>
        </div>

        {/* General Settings */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
            <Server className="w-4 h-4" /> Paramètres Généraux de l'Hôte
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Nom de l'Hôte *</label>
              <input
                type="text"
                required
                placeholder="ex: pve-cluster-node-01"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
              />
            </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Endpoint URL / IP *</label>
            <input
              type="text"
              required
              placeholder="https://192.168.1.100:8006"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">Description (Optionnel)</label>
          <input
            type="text"
            placeholder="Serveur de virtualisation principal datacenter..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
          />
        </div>
      </div>

      {/* Dynamic Adapter Connection Fields */}
      {adapter.connectionFields.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
            <Server className="w-4 h-4" /> Paramètres Spécifiques : {adapter.displayName}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {adapter.connectionFields.map(f => renderField(f, false))}
          </div>
        </div>
      )}

      {/* Dynamic Adapter Credential Fields (AES-256-GCM Vault) */}
      {adapter.credentialFields.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <Key className="w-4 h-4" /> Identifiants & Secrets (Coffre AES-256-GCM)
              </h4>
              {isEdit && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Laissez ces champs vides pour conserver les identifiants chiffrés actuels.
                </p>
              )}
            </div>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400" /> Chiffré au repos
            </span>
          </div>
          <div className="space-y-3">
            {adapter.credentialFields.map(f => renderField(f, true))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
        >
          {loading ? 'Enregistrement sécurisé...' : (isEdit ? 'Mettre à jour l’Équipement' : 'Enregistrer l’Hôte')}
        </button>
      </div>
    </form>

    {showTutorial && (
      <ServiceTutorialModal
        initialService={adapter.type}
        onClose={() => setShowTutorial(false)}
      />
    )}
  </>
  );
};
