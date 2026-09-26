# TrueNAS SCALE & Applications Integration Guide — FleetUpdate-Hub

This guide details how to connect your **TrueNAS SCALE** (or TrueNAS CORE) server and orchestrate updates for both the host operating system and installed applications (Docker Compose apps on TrueNAS SCALE 24.10+ Electric Eel, and Helm Chart Releases on SCALE 22.12 - 24.04).

---

## 1. Generate an API Key (Least Privilege)

1. Log in to your TrueNAS SCALE WebGUI as an administrator (e.g. `https://192.168.1.150` or `https://truenas.local`).
2. In the top-right corner, click on your **User Profile** or click the **Gear Icon (Settings)**.
3. Select **API Keys** and click **Add**:
   - **Name**: `fleetupdate-agent`
   - Click **Save / Generate Key**.
4. Copy the generated API key (token format: `1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
   *(Note: TrueNAS only displays the full API key once).*

---

## 2. Configure Host in FleetUpdate-Hub

In the FleetUpdate-Hub console, click **Add Host** (`/hosts?action=new`):

- **Name**: e.g. `TrueNAS Production NAS`
- **Adapter Type**: `TrueNAS SCALE & Applications` (`TRUENAS`)
- **Endpoint URL**: `https://192.168.1.150` (or `https://truenas.local`)
- **Allow Self-Signed SSL Certificates**: Check `True` if using default or internal TrueNAS certificates.
- **Update Scope**:
  - `All (System OS + Applications)`: Orchestrates updates for both the TrueNAS operating system and all installed apps.
  - `Applications Only (Docker / Charts)`: Manages and updates applications without touching the underlying TrueNAS OS.
  - `System OS Only`: Only audits and applies base TrueNAS firmware updates.
- **Target Application Name (Optional)**:
  - Leave empty to manage all installed apps.
  - Or specify an app ID (e.g. `nextcloud`, `plex`, `vaultwarden`) to isolate updates.
- **ZFS Snapshot Dataset**: Defaults to `boot-pool` (or specify an application dataset e.g. `tank/ix-applications`).
- **TrueNAS API Key**: Paste the generated Bearer API key.

---

## 3. Supported Features & Safety Safeguards

| Feature | Details |
| :--- | :--- |
| **REST API Protocol** | TrueNAS REST API v2.0 (`/api/v2.0/`) with Bearer token authentication |
| **Dual App Backend** | Automatically detects and supports modern Docker Compose apps (SCALE 24.10+) and legacy Helm chart releases (SCALE 22-24) |
| **ZFS Safety Checkpoint** | Creates an atomic pre-update ZFS snapshot on `boot-pool` or your selected pool before running updates |
| **Automated Rollback** | In case of post-update healthcheck failure, rolls back the ZFS snapshot or container release |
| **Reboot Verification** | Monitors system reboot during OS updates with active API reachability probes |
| **Alerts Audit** | Checks active TrueNAS alerts during healthchecks to flag critical hardware or pool warnings |
