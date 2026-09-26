# Proxmox Backup Server (PBS) Least-Privilege Setup Guide

This guide explains how to configure **Proxmox Backup Server (PBS)** for integration with FleetUpdate-Hub under the principle of least privilege.

---

## 1. Create a Dedicated Service User & API Token

Execute the following commands as `root` in the PBS terminal shell:

### A. Create the Service User
```bash
# Create dedicated user on the pbs realm
proxmox-backup-manager user create fleetupdate@pbs --comment "FleetUpdate-Hub Service Account"
```

### B. Create an API Token
```bash
# Generate the API token (disable privilege separation to inherit permissions)
proxmox-backup-manager user token create fleetupdate@pbs update-agent
```

The terminal will display the token secret (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
> [!IMPORTANT]
> Save the displayed secret key immediately. It cannot be retrieved again from PBS.

### C. Assign Minimal Permissions
Grant read-only audit permissions on datastores and system telemetry:
```bash
# Grant Datastore.Audit permission on root path
proxmox-backup-manager acl update / Datastore.Audit --auth-id fleetupdate@pbs!update-agent
proxmox-backup-manager acl update / Sys.Audit --auth-id fleetupdate@pbs!update-agent
```

---

## 2. Configure SSH for Terminal Package Upgrades (Optional)

To enable FleetUpdate-Hub to execute Debian system upgrades (`apt-get dist-upgrade`) on the PBS node:
1. Provide the node's SSH credentials (`root` or a dedicated user with sudoers permissions for `/usr/bin/apt-get`).
2. If using a dedicated user, allow passwordless sudo in `/etc/sudoers.d/fleetupdate`:
   ```sudoers
   fleetupdate ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /bin/systemctl, /sbin/reboot
   ```

---

## 3. Register PBS in FleetUpdate-Hub

In FleetUpdate-Hub, click **Add Host**:
- **Name**: `PBS Backup Server`
- **Type**: `PROXMOX_BACKUP_SERVER`
- **Endpoint URL**: `https://192.168.1.101:8007` (or your PBS WebGUI URL)
- **Allow Self-Signed SSL**: Checked (if using internal self-signed TLS certificates)
- **Token ID**: `fleetupdate@pbs!update-agent`
- **Token Secret**: The secret UUID saved in Step 1
- **SSH Username** *(Optional)*: `root` or `fleetupdate`
- **SSH Private Key / Password** *(Optional)*: Your SSH authentication credentials for package upgrades
