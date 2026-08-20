#!/usr/bin/env bash
# ==============================================================================
# FleetUpdate-Hub - Linux Host Least-Privilege SSH Setup Script
# Run this on your target Linux machine (Ubuntu, Debian, RHEL, Fedora, Arch) as root
# ==============================================================================
set -euo pipefail

PUBKEY="${1:-}"

if [ -z "$PUBKEY" ]; then
    echo "Usage: sudo ./setup-target-linux.sh \"<ssh-ed25519-public-key>\""
    exit 1
fi

echo "🛡️ Setting up dedicated fleetupdate service account on Linux host..."

# 1. Create dedicated user without password login
if ! id "fleetupdate" &>/dev/null; then
    useradd -r -m -s /bin/bash fleetupdate
    echo "  [OK] User fleetupdate created"
fi

# 2. Add SSH authorized key
USER_SSH_DIR="/home/fleetupdate/.ssh"
mkdir -p "$USER_SSH_DIR"
chmod 700 "$USER_SSH_DIR"
echo "$PUBKEY" > "$USER_SSH_DIR/authorized_keys"
chmod 600 "$USER_SSH_DIR/authorized_keys"
chown -R fleetupdate:fleetupdate "$USER_SSH_DIR"
echo "  [OK] SSH Authorized key installed for fleetupdate"

# 3. Configure strict Sudoers rule (Only package managers allowed without password)
SUDOERS_FILE="/etc/sudoers.d/fleetupdate"

cat << 'EOF' > "$SUDOERS_FILE"
# FleetUpdate-Hub least-privilege automation commands
fleetupdate ALL=(ALL) NOPASSWD: \
    /bin/tar, /usr/bin/tar, \
    /usr/bin/docker, \
    /usr/bin/apt, /usr/bin/apt-get, /usr/bin/needrestart, \
    /usr/bin/dnf, /usr/bin/yum, /usr/bin/needs-restarting, \
    /usr/bin/pacman, /usr/bin/checkupdates, \
    /sbin/apk, /usr/bin/apk, \
    /usr/bin/zypper, \
    /sbin/reboot, /usr/sbin/reboot, /bin/systemctl reboot
EOF

chmod 440 "$SUDOERS_FILE"
echo "  [OK] Sudoers restrictions applied in $SUDOERS_FILE"

echo "✅ Linux host ready for agentless SSH management by FleetUpdate-Hub!"
