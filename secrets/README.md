# Dossier de Secrets Docker

Ce répertoire contient les fichiers de secrets utilisés par Docker Compose en production.
**NE COMMITEZ JAMAIS DE FICHIERS `.txt` DANS CE DOSSIER.**

Pour générer automatiquement les secrets sécurisés, exécutez le script :
- Linux/macOS : `bash scripts/generate-secrets.sh`
- Windows PowerShell : `pwsh scripts/generate-secrets.ps1`

### Fichiers générés :
- `db_password.txt` : Mot de passe de la base PostgreSQL
- `master_key.txt` : Clé maîtresse AES-256 de 64 caractères hexadécimaux
- `db_connection_url.txt` : URL de connexion PostgreSQL complète
- `jwt_secret.txt` : Secret JWT de signature des sessions
