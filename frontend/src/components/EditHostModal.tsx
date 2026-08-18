import React, { useState, useEffect } from "react";
import { Host, AdapterMetadata } from "../types/index.js";
import { hostsService } from "../services/hosts.service.js";
import { useToast } from "../context/ToastContext.js";
import { DynamicAdapterForm } from "./DynamicAdapterForm.js";
import { Edit3, X, AlertCircle } from "lucide-react";

interface EditHostModalProps {
  host: Host;
  adapters?: AdapterMetadata[];
  onClose: () => void;
  onSuccess: (updatedHost: Host) => void;
}

export const EditHostModal: React.FC<EditHostModalProps> = ({
  host,
  adapters: initialAdapters,
  onClose,
  onSuccess
}) => {
  const [adapters, setAdapters] = useState<AdapterMetadata[]>(initialAdapters || []);
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingAdapters, setFetchingAdapters] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const initAdapters = async () => {
      let list = adapters;
      if (!list || list.length === 0) {
        setFetchingAdapters(true);
        try {
          list = await hostsService.getAdapters();
          setAdapters(list);
        } catch (e: any) {
          addToast("error", "Erreur", "Impossible de charger les métadonnées des modules.");
        } finally {
          setFetchingAdapters(false);
        }
      }
      const match = list.find((a) => a.type === host.adapterType) || list[0] || null;
      setSelectedAdapter(match);
    };
    initAdapters();
  }, [host]);

  const handleUpdate = async (formData: any) => {
    setLoading(true);
    try {
      const res = await hostsService.updateHost(host.id, {
        name: formData.name,
        description: formData.description,
        endpointUrl: formData.endpointUrl,
        port: formData.port,
        metadata: formData.metadata,
        credentials: formData.credentials
      });
      addToast("success", "Équipement mis à jour", res.message || "Paramètres enregistrés avec succès.");
      onSuccess(res.host);
      onClose();
    } catch (err: any) {
      addToast("error", "Échec de modification", err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel-glow w-full max-w-2xl rounded-3xl border border-cyan-500/30 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header - Identical to Add Modal */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Modifier l'Équipement</h3>
              <p className="text-xs text-slate-400">
                Ajustez les paramètres de connexion, options avancées et identifiants du coffre
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

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Adapter Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">Module d'Intégration</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {adapters.map((a) => (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => setSelectedAdapter(a)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedAdapter?.type === a.type
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-md shadow-cyan-500/10"
                      : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="font-semibold text-xs text-white">{a.displayName}</div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">{a.type}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedAdapter ? (
            <DynamicAdapterForm
              adapter={selectedAdapter}
              initialValues={{
                name: host.name,
                description: host.description || "",
                endpointUrl: host.endpointUrl,
                port: host.port,
                metadata: (host.metadata as Record<string, any>) || {},
                credentials: {}
              }}
              isEdit={true}
              onSubmit={handleUpdate}
              onCancel={onClose}
              loading={loading}
            />
          ) : fetchingAdapters ? (
            <div className="py-12 text-center text-slate-400 text-xs animate-pulse">
              Chargement de la configuration du module...
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Aucun module disponible pour cet équipement.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
