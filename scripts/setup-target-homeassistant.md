# Home Assistant Integration Guide — FleetUpdate-Hub

This guide details both methods of connecting **Home Assistant** with FleetUpdate-Hub:
1. **Managing Home Assistant as a Target Host:** Auditing and updating Home Assistant Core, OS, Supervisor, and Add-ons with automated safety snapshots.
2. **Synchronizing Homelab Entities to Home Assistant:** Publishing native `update.fleetupdate_*` entities to Home Assistant with a 100% outbound zero-trust WebSocket connection (zero inbound open ports).

---

## 1. Generate a Long-Lived Access Token (LLAT)

1. Log in to your Home Assistant dashboard (e.g. `http://homeassistant.local:8123` or `http://192.168.1.200:8123`).
2. Click on your **User Profile** (bottom-left avatar on the sidebar).
3. Scroll down to the **Long-Lived Access Tokens** section.
4. Click **Create Token**:
   - **Token Name**: `FleetUpdate-Hub`
   - Copy the generated token string (`eyJhbGciOi...`).

---

## 2. Mode A: Manage Home Assistant as a Target Host

To monitor and update Home Assistant Core, Operating System, and Add-ons from FleetUpdate-Hub:

1. In FleetUpdate-Hub, click **Add Host**.
2. Fill in the host details:
   - **Name**: `Home Assistant Smart Hub`
   - **Type**: `HOME_ASSISTANT`
   - **Endpoint URL**: `http://192.168.1.200:8123` (or your internal URL)
   - **Access Token**: Paste the Long-Lived Access Token.
   - **Target Entity ID (Optional)**: Leave blank to manage all components, or target a specific entity (e.g. `update.home_assistant_core_update`).
3. **Safety Guarantee:** Before applying any update, FleetUpdate-Hub triggers an automated Home Assistant Supervisor backup (`backup/create` or `hassio/backup_full`) and passes `backup: true` to the installer service.

---

## 3. Mode B: Zero-Trust Homelab Sync & Actionable Notifications

FleetUpdate-Hub can automatically project all managed infrastructure (Proxmox, TrueNAS, Docker, Linux, OPNsense) into Home Assistant as native `update` entities with official brand icons.

### Why It's 100% Secure (Air-Gap Outbound Model)
- **Zero Inbound Ports:** Home Assistant never initiates connections to FleetUpdate-Hub.
- **Outbound WebSocket Client:** FleetUpdate-Hub connects *outward* to Home Assistant's WebSocket API (`ws://.../api/websocket`) to listen for native click events.
- **Armed / Disarmed Guard:** Under **Settings > Notifications > Home Assistant**, you can keep the trigger **Disarmed (Read-Only)**. If Home Assistant is exposed to the internet and compromised, button clicks will be rejected immediately by FleetUpdate-Hub.

### Configuration Steps:
1. In FleetUpdate-Hub, navigate to **Settings** $\rightarrow$ **Notifications**.
2. Select the **Home Assistant** channel:
   - **Enable Channel**: Checked.
   - **Home Assistant URL**: `http://192.168.1.200:8123`
   - **Long-Lived Access Token**: Paste your token.
   - **Notification Service**: `notify.notify` (or `notify.mobile_app_<phone>` for companion app push notifications).
   - **Synchronize Entities**: Checked (publishes `update.fleetupdate_<host_name>` entities).
   - **Allow Updates from Home Assistant**: Toggle to **Armed** if you wish to trigger updates directly from the Home Assistant dashboard or Companion notifications.
