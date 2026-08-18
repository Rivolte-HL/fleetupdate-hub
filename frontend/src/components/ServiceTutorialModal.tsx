import React, { useState } from 'react';
import {
  X,
  Server,
  Archive,
  Shield,
  Box,
  Home,
  Terminal,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
  Key,
  ShieldAlert,
  Info
} from 'lucide-react';

interface ServiceTutorialModalProps {
  initialService?: string;
  onClose: () => void;
}

interface TutorialData {
  id: string;
  name: string;
  icon: any;
  color: string;
  badge: string;
  summary: string;
  steps: {
    title: string;
    description: string;
    command?: string;
    tip?: string;
  }[];
  formFieldsGuide: { field: string; example: string; note: string }[];
}

export const ServiceTutorialModal: React.FC<ServiceTutorialModalProps> = ({
  initialService = 'PROXMOX',
  onClose
}) => {
  const [activeService, setActiveService] = useState<string>(initialService);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const tutorials: Record<string, TutorialData> = {
    PROXMOX: {
      id: 'PROXMOX',
      name: 'Proxmox VE (Cluster & Node)',
      icon: Server,
      color: 'text-amber-400',
      badge: 'API REST + SSH',
      summary:
        'Gestion hybride : Les audits, statuts et snapshots passent par l’API REST Proxmox, tandis que l’installation physique des paquets (apt-get dist-upgrade) s’exécute via SSH.',
      steps: [
        {
          title: '1. Créer le rôle de sécurité Moindre Privilège sur Proxmox VE',
          description:
            'Connectez-vous en SSH ou dans le Shell Web Proxmox (en tant que root) et exécutez la commande suivante pour créer un rôle dédié avec les privilèges minimaux nécessaires :',
          command:
            'pveum role add FleetUpdateRole -privs "Sys.Audit Sys.Modify Sys.Syslog Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"'
        },
        {
          title: '2. Créer l’utilisateur API et lui assigner le rôle',
          description:
            'Créez l’utilisateur fleetupdate dans le realm pve et appliquez-lui le rôle créé sur la racine du cluster :',
          command:
            'pveum user add fleetupdate@pve\npveum acl modify / -user fleetupdate@pve -role FleetUpdateRole'
        },
        {
          title: '3. Générer le Token API',
          description:
            'Générez le token API sans séparation de privilèges pour permettre la détection des paquets :',
          command:
            'pveum user token add fleetupdate@pve update-agent --privsep 0'
        },
        {
          title: '4. Création de l’utilisateur sécurisé "fleetupdate" & Clé SSH (apt dist-upgrade)',
          description:
            'Pour une sécurité maximale (Moindre Privilège, sans utiliser root), exécutez cette commande dans le Shell Proxmox VE (en tant que root). Elle crée l’utilisateur système dédié "fleetupdate" restreint uniquement à apt-get et reboot via sudo :',
          command:
            'bash -c \'\nset -e\nif ! id "fleetupdate" &>/dev/null; then\n  useradd -m -s /bin/bash fleetupdate\nfi\nmkdir -p /home/fleetupdate/.ssh\nchmod 700 /home/fleetupdate/.ssh\nrm -f /home/fleetupdate/.ssh/id_fleetupdate_pve*\nssh-keygen -t ed25519 -f /home/fleetupdate/.ssh/id_fleetupdate_pve -N "" -q\ncat /home/fleetupdate/.ssh/id_fleetupdate_pve.pub >> /home/fleetupdate/.ssh/authorized_keys\nchmod 600 /home/fleetupdate/.ssh/authorized_keys\nchown -R fleetupdate:fleetupdate /home/fleetupdate/.ssh\necho "fleetupdate ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/sbin/reboot, /sbin/reboot" > /etc/sudoers.d/fleetupdate\nchmod 0440 /etc/sudoers.d/fleetupdate\necho -e "\\n=== COPIEZ LA CLÉ PRIVÉE CI-DESSOUS DANS FLEETUPDATE-HUB ===\\n"\ncat /home/fleetupdate/.ssh/id_fleetupdate_pve\necho -e "\\n============================================================\\n"\n\'',
          tip: 'Sécurité : L’utilisateur fleetupdate ne peut exécuter QUE apt-get et reboot, sans mot de passe.'
        }
      ],
      formFieldsGuide: [
        { field: "Endpoint URL / IP", example: "https://pve.example.com:8006", note: "Nom de domaine ou IP vers l'interface Web PVE." },
        { field: "PVE API Token ID", example: "fleetupdate@pve!update-agent", note: "L'identifiant du token généré à l'étape 3." },
        { field: "PVE Token Secret Key", example: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", note: "La clé secrète affichée lors de la création du token." },
        { field: "Adresse IP / Hôte SSH", example: "192.168.1.50", note: "Optionnel si identique à l'API. Très utile avec un proxy inverse." },
        { field: "Utilisateur / Clé SSH", example: "fleetupdate + Clé Privée", note: "Utilisateur dédié sécurisé avec sudo restreint." }
      ]
    },

    PROXMOX_BACKUP_SERVER: {
      id: 'PROXMOX_BACKUP_SERVER',
      name: 'Proxmox Backup Server (PBS)',
      icon: Archive,
      color: 'text-emerald-400',
      badge: 'API REST + SSH',
      summary:
        'Supervision des datastores, vérification des paquets Debian/PBS en temps réel et installation physique des mises à niveau du système via SSH.',
      steps: [
        {
          title: '1. Créer l’utilisateur API sur Proxmox Backup Server',
          description:
            'Connectez-vous en SSH sur votre serveur PBS (en tant que root) et créez l’utilisateur de service dédié :',
          command:
            'proxmox-backup-manager user create fleetupdate@pbs --comment "FleetUpdate Hub Service Account"'
        },
        {
          title: '2. Générer le Token API',
          description:
            'Générez le token API d’authentification pour FleetUpdate-Hub :',
          command:
            'proxmox-backup-manager user generate-token fleetupdate@pbs update-agent --comment "Token pour FleetUpdate-Hub"'
        },
        {
          title: '3. Assigner les permissions d’administration et d’audit (ACLs)',
          description:
            'Sur PBS, le token hérite des droits de son utilisateur parent. Accordez le rôle Admin à l’utilisateur et au token :',
          command:
            "proxmox-backup-manager acl update / Admin --auth-id 'fleetupdate@pbs'\nproxmox-backup-manager acl update / Admin --auth-id 'fleetupdate@pbs!update-agent'"
        },
        {
          title: '4. Création de l’utilisateur sécurisé "fleetupdate" & Clé SSH (apt dist-upgrade)',
          description:
            'Pour une sécurité maximale (sans compte root), exécutez cette commande dans le Shell PBS (en tant que root). Elle crée un compte système dédié "fleetupdate" restreint via sudo uniquement à apt-get et reboot :',
          command:
            'bash -c \'\nset -e\nif ! id "fleetupdate" &>/dev/null; then\n  useradd -m -s /bin/bash fleetupdate\nfi\nmkdir -p /home/fleetupdate/.ssh\nchmod 700 /home/fleetupdate/.ssh\nrm -f /home/fleetupdate/.ssh/id_fleetupdate_pbs*\nssh-keygen -t ed25519 -f /home/fleetupdate/.ssh/id_fleetupdate_pbs -N "" -q\ncat /home/fleetupdate/.ssh/id_fleetupdate_pbs.pub >> /home/fleetupdate/.ssh/authorized_keys\nchmod 600 /home/fleetupdate/.ssh/authorized_keys\nchown -R fleetupdate:fleetupdate /home/fleetupdate/.ssh\necho "fleetupdate ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/sbin/reboot, /sbin/reboot" > /etc/sudoers.d/fleetupdate\nchmod 0440 /etc/sudoers.d/fleetupdate\necho -e "\\n=== COPIEZ LA CLÉ PRIVÉE CI-DESSOUS DANS FLEETUPDATE-HUB ===\\n"\ncat /home/fleetupdate/.ssh/id_fleetupdate_pbs\necho -e "\\n============================================================\\n"\n\'',
          tip: 'Sécurité : Aucun mot de passe root requis. L’utilisateur fleetupdate ne peut rien modifier d’autre sur le système.'
        }
      ],
      formFieldsGuide: [
        { field: 'Endpoint URL / IP', example: 'https://pbs.example.com:8007 (ou IP:8007)', note: 'URL complète de l’interface Proxmox Backup Server.' },
        { field: 'Nom du Nœud PBS', example: 'localhost (ou nom de la machine)', note: 'Nom du nœud PBS ou "localhost".' },
        { field: 'PBS API Token ID', example: 'fleetupdate@pbs!update-agent', note: 'Identifiant du token généré à l’étape 2.' },
        { field: 'PBS Token Secret Key', example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', note: 'Clé secrète affichée lors de la génération du token.' },
        { field: 'Utilisateur SSH / Clé Privée', example: 'fleetupdate + Clé Privée', note: 'Compte dédié sécurisé avec sudo restreint à apt-get.' }
      ]
    },

    OPNSENSE: {
      id: 'OPNSENSE',
      name: 'OPNsense (Firewall & Routeur)',
      icon: Shield,
      color: 'text-cyan-400',
      badge: 'Core REST API',
      summary:
        'Audit en temps réel des paquets FreeBSD et déclenchement sécurisé des mises à jour système (pkg upgrade & base firmware) avec suivi asynchrone.',
      steps: [
        {
          title: '1. Créer un utilisateur ou utiliser un compte dédié',
          description:
            'Dans l’interface OPNsense, rendez-vous dans System > Access > Users. Cliquez sur + pour ajouter un utilisateur (ex: fleetupdate).'
        },
        {
          title: '2. Assigner le privilège de mise à jour',
          description:
            'Dans la section Effective Privileges de l’utilisateur, ajoutez le privilège suivant (un seul privilège regroupe l’accès Firmware dans l’interface OPNsense) :',
          command: 'System: Firmware',
          tip: 'Ce privilège unique autorise l’accès aux endpoints /api/core/firmware/status, check, upgrade et reboot.'
        },
        {
          title: '3. Générer la paire de clés API',
          description:
            'Toujours sur la page de l’utilisateur, cliquez sur le bouton + (API Keys). OPNsense télécharge automatiquement un fichier .txt contenant votre API Key et votre API Secret.'
        },
        {
          title: '4. Vérifier la règle de Pare-feu inter-VLAN',
          description:
            'Assurez-vous qu’une règle dans Firewall > Rules autorise le conteneur FleetUpdate-Hub à joindre le port HTTPS de l’interface web OPNsense (ex: port 443 ou port personnalisé).',
          tip: 'Si vous utilisez un certificat auto-signé, cochez "Autoriser certificats SSL auto-signés" dans FleetUpdate-Hub.'
        }
      ],
      formFieldsGuide: [
        { field: "Endpoint URL / IP", example: "https://router.example.com", note: "URL HTTPS de l'interface OPNsense." },
        { field: "Port", example: "443 (ou 8443)", note: "Port d'écoute de l'interface web." },
        { field: "OPNsense API Key", example: "k7...xxxxxxxx", note: "La clé API issue du fichier téléchargé." },
        { field: "OPNsense API Secret", example: "s8...xxxxxxxx", note: "Le secret API correspondant." }
      ]
    },

    DOCKER: {
      id: 'DOCKER',
      name: 'Docker Multi-Host & Proxy',
      icon: Box,
      color: 'text-blue-400',
      badge: 'Socket Proxy / HTTPS / mTLS',
      summary:
        'Inspection fine des conteneurs distants, comparaison des digests de registre (Docker Hub, GHCR, LinuxServer, Quay) et recréation réelle des conteneurs avec rollback automatique.',
      steps: [
        {
          title: 'Méthode A (Recommandée) : docker-socket-proxy avec HTTPS et Mot de passe',
          description:
            'Déployez le conteneur tecnativa/docker-socket-proxy sur votre machine Docker avec les variables d’environnement suivantes :',
          command:
            'services:\n  docker-proxy:\n    image: tecnativa/docker-socket-proxy\n    environment:\n      - CONTAINERS=1\n      - IMAGES=1\n      - INFO=1\n      - PING=1\n      - POST=1\n      - DELETE=1\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock:ro\n    ports:\n      - "2375:2375"'
        },
        {
          title: 'Sécuriser avec Nginx Proxy Manager (Nom de domaine + Mot de passe)',
          description:
            'Dans Nginx Proxy Manager :\n1. Créez un Proxy Host (ex: docker.example.com -> IP_DOCKER:2375)\n2. Activez le SSL (Force SSL)\n3. Dans Access List, choisissez une liste avec Username et Password (Basic Auth).',
          tip: 'Dans FleetUpdate-Hub, renseignez l’URL HTTPS du domaine et entrez votre utilisateur et mot de passe dans la section Coffre de Secrets.'
        },
        {
          title: 'Méthode B : Socket TCP natif avec mTLS (Certificats)',
          description:
            'Si vous préférez mTLS natif sur le port 2376, utilisez le script de génération automatique disponible dans FleetUpdate-Hub :',
          command: 'bash /opt/fleetupdate-hub/scripts/setup-target-docker.sh'
        }
      ],
      formFieldsGuide: [
        { field: "Endpoint URL / IP", example: "https://docker.example.com", note: "URL HTTPS du proxy ou https://IP:2376 pour mTLS." },
        { field: "Nom d'utilisateur Proxy", example: "fleetadmin", note: "Votre utilisateur HTTP Basic Auth (si proxy avec mot de passe)." },
        { field: "Mot de passe Proxy", example: "••••••••", note: "Votre mot de passe sécurisé (chiffré dans le coffre AES-256-GCM)." },
        { field: "Certificats mTLS", example: "ca.pem, cert.pem, key.pem", note: "À renseigner uniquement si vous utilisez l'option mTLS par certificats." }
      ]
    },

    HOME_ASSISTANT: {
      id: 'HOME_ASSISTANT',
      name: 'Home Assistant (OS / Supervised / Core)',
      icon: Home,
      color: 'text-indigo-400',
      badge: 'REST API & Update Platform',
      summary:
        'Supervision centralisée et installation des mises à jour de Home Assistant Core, OS, Supervisor, Add-ons officiels et composants HACS.',
      steps: [
        {
          title: '1. Créer un Jeton d’Accès Longue Durée (Long-Lived Access Token)',
          description:
            'Dans votre instance Home Assistant :\n1. Cliquez sur votre Profil utilisateur (tout en bas de la barre latérale gauche)\n2. Descendez en bas de la page jusqu’à la section "Jetons d’accès longue durée" (Long-Lived Access Tokens)\n3. Cliquez sur "Créer un jeton"\n4. Nommez-le "FleetUpdate-Hub" et validez.'
        },
        {
          title: '2. Copier le jeton généré',
          description:
            'Copiez immédiatement le jeton affiché. Ce jeton ne sera plus réaffiché par Home Assistant.'
        },
        {
          title: '3. Enregistrer dans FleetUpdate-Hub',
          description:
            'Renseignez l’URL locale ou externe de votre Home Assistant et collez le jeton dans le champ API Token.',
          tip: 'Note : Les backups automatiques lors des mises à jour de cartes HACS sont gérés de manière transparente pour éviter toute erreur HTTP 500 sur le serveur.'
        }
      ],
      formFieldsGuide: [
        { field: "Endpoint URL / IP", example: "https://ha.example.com (ou http://192.168.1.100:8123)", note: "URL d'accès à Home Assistant." },
        { field: "Home Assistant API Token", example: "eyJhbGciOiJIUzI1NiIsIn...", note: "Le jeton d'accès longue durée créé sur votre profil." }
      ]
    },

    LINUX_SSH: {
      id: 'LINUX_SSH',
      name: 'Serveurs & VM Linux (SSH Agentless)',
      icon: Terminal,
      color: 'text-emerald-400',
      badge: 'APT / DNF / PACMAN / APK / ZYPPER',
      summary:
        'Mises à niveau de paquets sécurisées et audit sans agent pour toutes vos VM et serveurs Linux (Debian, Ubuntu, AlmaLinux, Rocky, Alpine, Arch, Fedora).',
      steps: [
        {
          title: 'Méthode 1 (Recommandée) : Configuration automatique en 1 commande sur la VM cible',
          description:
            'Connectez-vous dans le terminal de votre VM Linux (ou console Proxmox/SSH) et collez simplement cette commande complète. Elle va créer l’utilisateur fleetupdate, générer la clé SSH Ed25519 directement sur la VM, configurer les permissions et vous afficher la clé privée à copier :',
          command:
            `sudo bash -c '
useradd -m -s /bin/bash fleetupdate 2>/dev/null || true
mkdir -p /home/fleetupdate/.ssh
ssh-keygen -t ed25519 -f /home/fleetupdate/.ssh/id_ed25519 -N "" -C "fleetupdate-agent" -q
cp /home/fleetupdate/.ssh/id_ed25519.pub /home/fleetupdate/.ssh/authorized_keys
chown -R fleetupdate:fleetupdate /home/fleetupdate/.ssh
chmod 700 /home/fleetupdate/.ssh && chmod 600 /home/fleetupdate/.ssh/authorized_keys
echo "fleetupdate ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/bin/dnf, /usr/bin/yum, /usr/bin/pacman, /sbin/apk, /usr/bin/zypper, /sbin/reboot, /usr/sbin/reboot, /bin/systemctl" > /etc/sudoers.d/fleetupdate
chmod 0440 /etc/sudoers.d/fleetupdate
echo -e "\\n======================================================="
echo "  CONFIGURATION FLEETUPDATE RÉUSSIE SUR CETTE VM !"
echo "======================================================="
echo "Copiez le bloc de clé privée ci-dessous dans FleetUpdate-Hub :"
echo ""
cat /home/fleetupdate/.ssh/id_ed25519
echo ""
echo "======================================================="
'`,
          tip: 'Une fois exécuté, sélectionnez et copiez la clé privée affichée (incluant -----BEGIN OPENSSH PRIVATE KEY----- et -----END OPENSSH PRIVATE KEY-----).'
        },
        {
          title: 'Méthode 2 : Génération manuelle de la clé sur un utilisateur existant (ou root)',
          description:
            'Si vous préférez générer la clé sur votre compte utilisateur existant ou sur root, exécutez ces commandes sur la VM :',
          command:
            'mkdir -p ~/.ssh && chmod 700 ~/.ssh\nssh-keygen -t ed25519 -f ~/.ssh/fleetupdate_key -N "" -q\ncat ~/.ssh/fleetupdate_key.pub >> ~/.ssh/authorized_keys\nchmod 600 ~/.ssh/authorized_keys\necho -e "\\n=== VOTRE CLÉ PRIVÉE SSH ===\\n"\ncat ~/.ssh/fleetupdate_key'
        },
        {
          title: '3. Enregistrer l’équipement dans FleetUpdate-Hub',
          description:
            'Dans FleetUpdate-Hub, remplissez les champs :\n• Endpoint URL / IP : l’adresse IP de votre VM (ex: 192.168.1.50)\n• Utilisateur SSH : fleetupdate (ou votre compte)\n• Clé Privée SSH : collez la clé générée sur la VM.',
          tip: 'Vous pouvez également enregistrer cette clé privée une seule fois dans le Coffre de Secrets (Vault) sous le nom "Clé SSH FleetUpdate" pour la réutiliser sur toutes vos VM !'
        }
      ],
      formFieldsGuide: [
        { field: "Endpoint URL / IP", example: "192.168.1.50 (ou vm-web.local)", note: "Adresse IP ou nom d'hôte de la VM Linux." },
        { field: "Port", example: "22", note: "Port SSH (22 par défaut)." },
        { field: "Utilisateur SSH", example: "fleetupdate (ou root)", note: "Nom du compte configuré sur la VM." },
        { field: "Gestionnaire de Paquets", example: "APT (Debian/Ubuntu) ou DNF", note: "Sélectionnez le système de paquets de votre distribution." },
        { field: "Clé Privée SSH", example: "-----BEGIN OPENSSH PRIVATE KEY-----...", note: "Collez la clé privée affichée lors de la création sur la VM." }
      ]
    }
  };

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
                Guides & Tutoriels d'Intégration
              </h3>
              <p className="text-xs text-slate-400">
                Instructions détaillées, commandes prêtes à l'emploi et bonnes pratiques de configuration
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

        {/* Service Selector Tabs */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 overflow-x-auto flex gap-2 shrink-0">
          {Object.values(tutorials).map((tut) => {
            const Icon = tut.icon;
            const isActive = activeService === tut.id;
            return (
              <button
                key={tut.id}
                onClick={() => setActiveService(tut.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
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
              <Key className="w-4 h-4" /> Étapes de Configuration sur l'Équipement Cible
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
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all flex items-center gap-1 text-[10px]"
                      title="Copier la commande"
                    >
                      {copiedIndex === `cmd-${idx}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier</span>
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
              <Server className="w-4 h-4" /> Correspondance des Champs dans FleetUpdate-Hub
            </h5>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                  <tr>
                    <th className="p-3">Champ dans l'interface</th>
                    <th className="p-3">Exemple de valeur</th>
                    <th className="p-3">Description & Rôle</th>
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
            Secrets et clés chiffrés automatiquement en AES-256-GCM
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Fermer le Guide
          </button>
        </div>
      </div>
    </div>
  );
};
