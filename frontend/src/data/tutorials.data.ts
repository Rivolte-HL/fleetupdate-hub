import {
  Server,
  Archive,
  Shield,
  Box,
  Home,
  Terminal
} from 'lucide-react';

export interface TutorialStep {
  title: string;
  description: string;
  command?: string;
  tip?: string;
}

export interface FormFieldGuide {
  field: string;
  example: string;
  note: string;
}

export interface TutorialData {
  id: string;
  name: string;
  icon: any;
  color: string;
  badge: string;
  summary: string;
  steps: TutorialStep[];
  formFieldsGuide: FormFieldGuide[];
}

export const tutorialsFr: Record<string, TutorialData> = {
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
      { field: 'Endpoint URL / IP', example: 'https://pbs.example.com:8007', note: 'URL complète de l’interface Proxmox Backup Server.' },
      { field: 'Nom du Nœud PBS', example: 'localhost', note: 'Nom du nœud PBS ou "localhost".' },
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
        title: '1. Créer un utilisateur dédié',
        description:
          'Dans l’interface OPNsense, rendez-vous dans System > Access > Users. Cliquez sur + pour ajouter un utilisateur (ex: fleetupdate).'
      },
      {
        title: '2. Assigner le privilège de mise à jour',
        description:
          'Dans la section Effective Privileges de l’utilisateur, ajoutez le privilège suivant :',
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
          'Assurez-vous qu’une règle dans Firewall > Rules autorise le conteneur FleetUpdate-Hub à joindre le port HTTPS de l’interface web OPNsense.',
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
      { field: "Nom d'utilisateur Proxy", example: "fleetadmin", note: "Votre utilisateur HTTP Basic Auth." },
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
          'Dans votre instance Home Assistant :\n1. Cliquez sur votre Profil utilisateur\n2. Rendez-vous dans la section "Jetons d’accès longue durée"\n3. Cliquez sur "Créer un jeton" et nommez-le "FleetUpdate-Hub".'
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
      { field: "Endpoint URL / IP", example: "https://ha.example.com", note: "URL d'accès à Home Assistant." },
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
          'Connectez-vous dans le terminal de votre VM Linux et collez cette commande complète. Elle va créer l’utilisateur fleetupdate, générer la clé SSH Ed25519 directement sur la VM, configurer les permissions et vous afficher la clé privée à copier :',
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
        tip: 'Une fois exécuté, sélectionnez et copiez la clé privée affichée.'
      },
      {
        title: 'Méthode 2 : Enregistrer l’équipement dans FleetUpdate-Hub',
        description:
          'Dans FleetUpdate-Hub, remplissez les champs :\n• Endpoint URL / IP : l’adresse IP de votre VM\n• Utilisateur SSH : fleetupdate\n• Clé Privée SSH : collez la clé générée sur la VM.',
        tip: 'Vous pouvez également enregistrer cette clé privée dans le Coffre de Secrets (Vault) pour la réutiliser sur toutes vos VM !'
      }
    ],
    formFieldsGuide: [
      { field: "Endpoint URL / IP", example: "192.168.1.50 (ou vm-web.local)", note: "Adresse IP ou nom d'hôte de la VM Linux." },
      { field: "Port", example: "22", note: "Port SSH (22 par défaut)." },
      { field: "Utilisateur SSH", example: "fleetupdate", note: "Nom du compte configuré sur la VM." },
      { field: "Gestionnaire de Paquets", example: "APT (Debian/Ubuntu) ou DNF", note: "Sélectionnez le gestionnaire de paquets." },
      { field: "Clé Privée SSH", example: "-----BEGIN OPENSSH PRIVATE KEY-----...", note: "Collez la clé privée affichée." }
    ]
  }
};

export const tutorialsEn: Record<string, TutorialData> = {
  PROXMOX: {
    id: 'PROXMOX',
    name: 'Proxmox VE (Cluster & Node)',
    icon: Server,
    color: 'text-amber-400',
    badge: 'REST API + SSH',
    summary:
      'Hybrid management: Audits, statuses, and snapshots are handled via Proxmox REST API, while physical package upgrades (apt-get dist-upgrade) run over secure SSH.',
    steps: [
      {
        title: '1. Create the Least-Privilege Security Role on Proxmox VE',
        description:
          'Connect via SSH or in the Proxmox Web Shell (as root) and run the following command to create a dedicated role with minimal required permissions:',
        command:
          'pveum role add FleetUpdateRole -privs "Sys.Audit Sys.Modify Sys.Syslog Datastore.Audit VM.Audit VM.Backup VM.Snapshot VM.Snapshot.Rollback"'
      },
      {
        title: '2. Create the API User and Assign the Role',
        description:
          'Create the fleetupdate user in the pve realm and bind the role to the cluster root path:',
        command:
          'pveum user add fleetupdate@pve\npveum acl modify / -user fleetupdate@pve -role FleetUpdateRole'
      },
      {
        title: '3. Generate the API Token',
        description:
          'Generate the API token without privilege separation to allow package detection:',
        command:
          'pveum user token add fleetupdate@pve update-agent --privsep 0'
      },
      {
        title: '4. Create the Dedicated "fleetupdate" SSH Account & Key (apt dist-upgrade)',
        description:
          'For maximum Zero-Trust security (without using root), run this command in the Proxmox VE Shell (as root). It creates a dedicated system user restricted only to apt-get and reboot via sudo:',
        command:
          'bash -c \'\nset -e\nif ! id "fleetupdate" &>/dev/null; then\n  useradd -m -s /bin/bash fleetupdate\nfi\nmkdir -p /home/fleetupdate/.ssh\nchmod 700 /home/fleetupdate/.ssh\nrm -f /home/fleetupdate/.ssh/id_fleetupdate_pve*\nssh-keygen -t ed25519 -f /home/fleetupdate/.ssh/id_fleetupdate_pve -N "" -q\ncat /home/fleetupdate/.ssh/id_fleetupdate_pve.pub >> /home/fleetupdate/.ssh/authorized_keys\nchmod 600 /home/fleetupdate/.ssh/authorized_keys\nchown -R fleetupdate:fleetupdate /home/fleetupdate/.ssh\necho "fleetupdate ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/sbin/reboot, /sbin/reboot" > /etc/sudoers.d/fleetupdate\nchmod 0440 /etc/sudoers.d/fleetupdate\necho -e "\\n=== COPY THE PRIVATE KEY BELOW INTO FLEETUPDATE-HUB ===\\n"\ncat /home/fleetupdate/.ssh/id_fleetupdate_pve\necho -e "\\n=======================================================\\n"\n\'',
        tip: 'Security: The fleetupdate user can ONLY execute apt-get and reboot, without password.'
      }
    ],
    formFieldsGuide: [
      { field: "Endpoint URL / IP", example: "https://pve.example.com:8006", note: "Domain name or IP to the PVE Web Interface." },
      { field: "PVE API Token ID", example: "fleetupdate@pve!update-agent", note: "Token ID generated in Step 3." },
      { field: "PVE Token Secret Key", example: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", note: "Secret key displayed upon token creation." },
      { field: "SSH IP / Hostname", example: "192.168.1.50", note: "Optional if same as API. Useful behind reverse proxies." },
      { field: "SSH User / Private Key", example: "fleetupdate + Private Key", note: "Dedicated user with restricted sudo permissions." }
    ]
  },
  PROXMOX_BACKUP_SERVER: {
    id: 'PROXMOX_BACKUP_SERVER',
    name: 'Proxmox Backup Server (PBS)',
    icon: Archive,
    color: 'text-emerald-400',
    badge: 'REST API + SSH',
    summary:
      'Datastore monitoring, real-time Debian/PBS package verification, and physical system upgrades over SSH.',
    steps: [
      {
        title: '1. Create the API User on Proxmox Backup Server',
        description:
          'Connect via SSH to your PBS server (as root) and create the dedicated service account:',
        command:
          'proxmox-backup-manager user create fleetupdate@pbs --comment "FleetUpdate Hub Service Account"'
      },
      {
        title: '2. Generate the API Token',
        description:
          'Generate the authentication token for FleetUpdate-Hub:',
        command:
          'proxmox-backup-manager user generate-token fleetupdate@pbs update-agent --comment "Token for FleetUpdate-Hub"'
      },
      {
        title: '3. Assign Permissions & ACLs',
        description:
          'On PBS, grant Admin permissions to the user and token:',
        command:
          "proxmox-backup-manager acl update / Admin --auth-id 'fleetupdate@pbs'\nproxmox-backup-manager acl update / Admin --auth-id 'fleetupdate@pbs!update-agent'"
      },
      {
        title: '4. Create Dedicated SSH User & Key (apt dist-upgrade)',
        description:
          'Run this command in the PBS shell (as root) to create a dedicated user with sudo restricted to apt-get and reboot:',
        command:
          'bash -c \'\nset -e\nif ! id "fleetupdate" &>/dev/null; then\n  useradd -m -s /bin/bash fleetupdate\nfi\nmkdir -p /home/fleetupdate/.ssh\nchmod 700 /home/fleetupdate/.ssh\nrm -f /home/fleetupdate/.ssh/id_fleetupdate_pbs*\nssh-keygen -t ed25519 -f /home/fleetupdate/.ssh/id_fleetupdate_pbs -N "" -q\ncat /home/fleetupdate/.ssh/id_fleetupdate_pbs.pub >> /home/fleetupdate/.ssh/authorized_keys\nchmod 600 /home/fleetupdate/.ssh/authorized_keys\nchown -R fleetupdate:fleetupdate /home/fleetupdate/.ssh\necho "fleetupdate ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/sbin/reboot, /sbin/reboot" > /etc/sudoers.d/fleetupdate\nchmod 0440 /etc/sudoers.d/fleetupdate\necho -e "\\n=== COPY THE PRIVATE KEY BELOW INTO FLEETUPDATE-HUB ===\\n"\ncat /home/fleetupdate/.ssh/id_fleetupdate_pbs\necho -e "\\n=======================================================\\n"\n\'',
        tip: 'Security: No root password required. The fleetupdate user cannot modify other system files.'
      }
    ],
    formFieldsGuide: [
      { field: 'Endpoint URL / IP', example: 'https://pbs.example.com:8007', note: 'Full URL to the Proxmox Backup Server interface.' },
      { field: 'PBS Node Name', example: 'localhost', note: 'Node name or "localhost".' },
      { field: 'PBS API Token ID', example: 'fleetupdate@pbs!update-agent', note: 'Token ID generated in Step 2.' },
      { field: 'PBS Token Secret Key', example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', note: 'Secret key shown during token generation.' },
      { field: 'SSH User / Private Key', example: 'fleetupdate + Private Key', note: 'Dedicated account with restricted sudo.' }
    ]
  },
  OPNSENSE: {
    id: 'OPNSENSE',
    name: 'OPNsense (Firewall & Router)',
    icon: Shield,
    color: 'text-cyan-400',
    badge: 'Core REST API',
    summary:
      'Real-time FreeBSD package audit and automated system upgrade execution (pkg upgrade & base firmware) with asynchronous tracking.',
    steps: [
      {
        title: '1. Create a Dedicated User',
        description:
          'In OPNsense WebGUI, go to System > Access > Users. Click + to add a user (e.g. fleetupdate).'
      },
      {
        title: '2. Assign Firmware Privileges',
        description:
          'In Effective Privileges, add the following privilege:',
        command: 'System: Firmware',
        tip: 'This single privilege allows access to /api/core/firmware/status, check, upgrade, and reboot endpoints.'
      },
      {
        title: '3. Generate API Key Pair',
        description:
          'On the user page, click + (API Keys). OPNsense automatically downloads a .txt file containing your API Key and Secret.'
      },
      {
        title: '4. Verify Inter-VLAN Firewall Rule',
        description:
          'Ensure a rule under Firewall > Rules allows FleetUpdate-Hub to reach the HTTPS port of OPNsense.',
        tip: 'If using a self-signed certificate, check "Allow Self-Signed SSL Certificates" in FleetUpdate-Hub.'
      }
    ],
    formFieldsGuide: [
      { field: "Endpoint URL / IP", example: "https://router.example.com", note: "HTTPS URL of OPNsense interface." },
      { field: "Port", example: "443 (or 8443)", note: "WebGUI listening port." },
      { field: "OPNsense API Key", example: "k7...xxxxxxxx", note: "API Key from the downloaded file." },
      { field: "OPNsense API Secret", example: "s8...xxxxxxxx", note: "Corresponding API Secret." }
    ]
  },
  DOCKER: {
    id: 'DOCKER',
    name: 'Docker Multi-Host & Proxy',
    icon: Box,
    color: 'text-blue-400',
    badge: 'Socket Proxy / HTTPS / mTLS',
    summary:
      'Deep remote container inspection, registry digest comparison (Docker Hub, GHCR, LinuxServer, Quay), and atomic container recreation with auto-rollback.',
    steps: [
      {
        title: 'Method A (Recommended): docker-socket-proxy with HTTPS & Basic Auth',
        description:
          'Deploy tecnativa/docker-socket-proxy on your Docker host with these environment variables:',
        command:
          'services:\n  docker-proxy:\n    image: tecnativa/docker-socket-proxy\n    environment:\n      - CONTAINERS=1\n      - IMAGES=1\n      - INFO=1\n      - PING=1\n      - POST=1\n      - DELETE=1\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock:ro\n    ports:\n      - "2375:2375"'
      },
      {
        title: 'Secure with Nginx Proxy Manager (Domain + Password)',
        description:
          'In Nginx Proxy Manager:\n1. Create a Proxy Host (e.g. docker.example.com -> DOCKER_IP:2375)\n2. Enable SSL (Force SSL)\n3. In Access List, select a Username & Password list (Basic Auth).',
        tip: 'In FleetUpdate-Hub, enter the HTTPS URL and your Basic Auth credentials in the Vault.'
      },
      {
        title: 'Method B: Native TCP Socket with mTLS (Certificates)',
        description:
          'If you prefer native mTLS on port 2376, run the automated setup script included in FleetUpdate-Hub:',
        command: 'bash /opt/fleetupdate-hub/scripts/setup-target-docker.sh'
      }
    ],
    formFieldsGuide: [
      { field: "Endpoint URL / IP", example: "https://docker.example.com", note: "HTTPS proxy URL or https://IP:2376 for mTLS." },
      { field: "Proxy Username", example: "fleetadmin", note: "HTTP Basic Auth username." },
      { field: "Proxy Password", example: "••••••••", note: "Secure password (stored in AES-256-GCM Vault)." },
      { field: "mTLS Certificates", example: "ca.pem, cert.pem, key.pem", note: "Required only when using native mTLS socket." }
    ]
  },
  HOME_ASSISTANT: {
    id: 'HOME_ASSISTANT',
    name: 'Home Assistant (OS / Supervised / Core)',
    icon: Home,
    color: 'text-indigo-400',
    badge: 'REST API & Update Platform',
    summary:
      'Centralized management and upgrade orchestration for Home Assistant Core, OS, Supervisor, Official Add-ons, and HACS components.',
    steps: [
      {
        title: '1. Create a Long-Lived Access Token',
        description:
          'In Home Assistant:\n1. Click your User Profile (bottom left)\n2. Scroll to the "Long-Lived Access Tokens" section\n3. Click "Create Token", name it "FleetUpdate-Hub" and confirm.'
      },
      {
        title: '2. Copy Generated Token',
        description:
          'Copy the displayed token immediately. It will not be shown again.'
      },
      {
        title: '3. Register in FleetUpdate-Hub',
        description:
          'Enter the local or external URL and paste the token into the API Token field.',
        tip: 'Note: Automatic backups for HACS cards are gracefully handled to prevent HTTP 500 errors.'
      }
    ],
    formFieldsGuide: [
      { field: "Endpoint URL / IP", example: "https://ha.example.com", note: "Home Assistant access URL." },
      { field: "Home Assistant API Token", example: "eyJhbGciOiJIUzI1NiIsIn...", note: "Long-Lived Access Token." }
    ]
  },
  LINUX_SSH: {
    id: 'LINUX_SSH',
    name: 'Linux Servers & VMs (SSH Agentless)',
    icon: Terminal,
    color: 'text-emerald-400',
    badge: 'APT / DNF / PACMAN / APK / ZYPPER',
    summary:
      'Secure agentless package updates and audits for all Linux VMs and hosts (Debian, Ubuntu, AlmaLinux, Rocky, Alpine, Arch, Fedora, openSUSE).',
    steps: [
      {
        title: 'Method 1 (Recommended): 1-Command Automated Target Setup',
        description:
          'Open a terminal on your target Linux VM and run this command. It creates the fleetupdate user, generates the Ed25519 SSH keypair, configures sudo permissions, and displays the private key:',
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
echo "  FLEETUPDATE SETUP COMPLETED SUCCESSFULLY ON THIS VM!"
echo "======================================================="
echo "Copy the private key block below into FleetUpdate-Hub:"
echo ""
cat /home/fleetupdate/.ssh/id_ed25519
echo ""
echo "======================================================="
'`,
        tip: 'Once completed, copy the private key block (including BEGIN and END OPENSSH PRIVATE KEY).'
      },
      {
        title: 'Method 2: Register Host in FleetUpdate-Hub',
        description:
          'In FleetUpdate-Hub, fill in the fields:\n• Endpoint URL / IP: IP address or hostname\n• SSH User: fleetupdate\n• SSH Private Key: paste the generated private key.',
        tip: 'You can also store this key once in the Vault under "FleetUpdate SSH Key" to reuse across all your Linux hosts!'
      }
    ],
    formFieldsGuide: [
      { field: "Endpoint URL / IP", example: "192.168.1.50 (or vm-web.local)", note: "IP address or hostname of the Linux machine." },
      { field: "Port", example: "22", note: "SSH port (default: 22)." },
      { field: "SSH User", example: "fleetupdate", note: "Configured username on target." },
      { field: "Package Manager", example: "APT (Debian/Ubuntu) or DNF", note: "Package manager type." },
      { field: "SSH Private Key", example: "-----BEGIN OPENSSH PRIVATE KEY-----...", note: "Paste the private key." }
    ]
  }
};
