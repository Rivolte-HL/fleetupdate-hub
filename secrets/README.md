# Docker Secrets Directory

This directory stores the production cryptographic secret files used by Docker Compose.
**NEVER COMMIT `.txt` FILES IN THIS DIRECTORY TO VERSION CONTROL.**

To generate secure secrets automatically, run:
- Linux / macOS: `bash scripts/generate-secrets.sh`
- Windows (PowerShell): `pwsh scripts/generate-secrets.ps1`

### Generated Secret Files:
- `db_password.txt`: PostgreSQL database master password
- `master_key.txt`: AES-256 Master Key (64 hex characters / 32 bytes)
- `db_connection_url.txt`: Full internal PostgreSQL connection URI
- `jwt_secret.txt`: Cryptographic JWT signing key for user sessions
