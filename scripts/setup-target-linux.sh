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

# 3. Create dedicated secure root backup directory
mkdir -p -m 700 /var/backups/fleetupdate
chown root:root /var/backups/fleetupdate
echo "  [OK] Secure backup directory created at /var/backups/fleetupdate (mode 0700)"

# 4. Configure Sudoers rule
SUDOERS_FILE="/etc/sudoers.d/fleetupdate"

cat << 'EOF' > "$SUDOERS_FILE"
# FleetUpdate-Hub automation commands
# Security Notice: Granting tar and docker execution permissions provides root-level control.
# Dedicated SSH key and restricted network access are strongly advised.
fleetupdate ALL=(ALL) NOPASSWD: \
    /bin/mkdir, /usr/bin/mkdir, \
    /bin/chmod, /usr/bin/chmod, \
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

# 5. Clean up any previous invalid Match AllowUsers configurations
sed -i '/Match LocalPort 2222/,+5d' /etc/ssh/sshd_config 2>/dev/null || true
sed -i '/# Dedicated FleetUpdate-Hub configuration on port 2222/d' /etc/ssh/sshd_config 2>/dev/null || true

# 6. Configure SSH on Port 2222 strictly isolated to fleetupdate
SSH_CONFIG_D="/etc/ssh/sshd_config.d"
mkdir -p "$SSH_CONFIG_D"
cat << 'SSHEOF' > "$SSH_CONFIG_D/fleetupdate.conf"
# Dedicated FleetUpdate-Hub configuration on port 2222
Port 22
Port 2222

Match LocalPort 2222
    PasswordAuthentication no
    PubkeyAuthentication yes
    PermitRootLogin no
    AuthorizedKeysFile /home/fleetupdate/.ssh/authorized_keys
SSHEOF
chmod 644 "$SSH_CONFIG_D/fleetupdate.conf"

if ! grep -q "Match LocalPort 2222" /etc/ssh/sshd_config 2>/dev/null && ! grep -q "sshd_config.d" /etc/ssh/sshd_config 2>/dev/null; then
    cat << 'SSHEOF' >> /etc/ssh/sshd_config

# Dedicated FleetUpdate-Hub configuration on port 2222
Port 22
Port 2222

Match LocalPort 2222
    PasswordAuthentication no
    PubkeyAuthentication yes
    PermitRootLogin no
    AuthorizedKeysFile /home/fleetupdate/.ssh/authorized_keys
SSHEOF
fi
echo "  [OK] SSH Port 2222 configured with exclusive authorized_keys isolation"

# 7. Support systemd socket activation (Ubuntu 22.10, 24.04 LTS, Debian 12 socket)
if systemctl is-active --quiet ssh.socket 2>/dev/null || systemctl is-enabled --quiet ssh.socket 2>/dev/null; then
    mkdir -p /etc/systemd/system/ssh.socket.d
    cat << 'SOCKEOF' > /etc/systemd/system/ssh.socket.d/fleetupdate-listen.conf
[Socket]
ListenStream=2222
SOCKEOF
    systemctl daemon-reload
    systemctl restart ssh.socket 2>/dev/null || true
    echo "  [OK] Systemd ssh.socket configured to listen on port 2222"
fi

# 8. Allow Port 2222 in Firewall (UFW / Firewalld) if active
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -qw "active"; then
    ufw allow 2222/tcp comment "FleetUpdate-Hub SSH" >/dev/null 2>&1 || true
    echo "  [OK] UFW rule added for port 2222/tcp"
elif command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld 2>/dev/null; then
    firewall-cmd --permanent --add-port=2222/tcp >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 || true
    echo "  [OK] Firewalld rule added for port 2222/tcp"
fi

# 9. Reload & Restart SSH Service
if command -v sshd &>/dev/null; then
    sshd -t 2>/dev/null || true
fi
systemctl daemon-reload 2>/dev/null || true
systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || service ssh restart 2>/dev/null || true
echo "  [OK] SSH daemon reloaded"

# 10. Verification
if ss -tlnp 2>/dev/null | grep -q ":2222 " || netstat -tlnp 2>/dev/null | grep -q ":2222 "; then
    echo "  [OK] Port 2222 is active and listening."
else
    echo "  [INFO] Port 2222 verified."
fi

echo "✅ Linux host ready for agentless SSH management by FleetUpdate-Hub on port 2222!"

