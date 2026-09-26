#!/usr/bin/env bash
# ==============================================================================
# FleetUpdate-Hub - Proxmox VE Least-Privilege Setup Script
# Run this on your Proxmox VE Node/Cluster (as root)
# ==============================================================================
set -euo pipefail

echo "🛡️ Configuring Proxmox VE for FleetUpdate-Hub..."

# 1. Create Dedicated Role with minimal permissions (or update if exists)
pveum role add FleetUpdateRole -privs "Sys.Audit Sys.Modify VM.Audit VM.Backup VM.PowerMgmt VM.Snapshot VM.Snapshot.Rollback" 2>/dev/null || \
pveum role modify FleetUpdateRole -privs "Sys.Audit Sys.Modify VM.Audit VM.Backup VM.PowerMgmt VM.Snapshot VM.Snapshot.Rollback"

# 2. Create User
pveum user add fleetupdate@pve -comment "Dedicated FleetUpdate-Hub Service Account" 2>/dev/null || true

# 3. Create API Token (Disable Privsep to inherit user permissions)
TOKEN_OUTPUT=$(pveum user token add fleetupdate@pve update-agent --privsep 0 --output-format json 2>/dev/null || \
pveum user token add fleetupdate@pve update-agent --privsep 0 --output-format json)

# 4. Assign Role to User at root path
pveum acl modify / -user fleetupdate@pve -role FleetUpdateRole

echo "✅ Proxmox VE service account configured successfully!"
echo "API Token Details:"
echo "$TOKEN_OUTPUT"
echo ""
echo "Use the following format in FleetUpdate-Hub Credential:"
echo "Token ID: fleetupdate@pve!update-agent"
echo "Secret: (The secret key shown in the JSON output above)"
echo ""
echo "💡 Note for OS package upgrades (apt-get dist-upgrade):"
echo "To allow FleetUpdate-Hub to execute 'apt-get dist-upgrade' on the Proxmox node,"
echo "provide your SSH credentials (root or a dedicated passwordless sudo user) in host settings."
