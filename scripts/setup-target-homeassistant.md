# Home Assistant Integration Guide — FleetUpdate-Hub

This guide explains how to connect your **Home Assistant** instance (Home Assistant OS, Supervised, or Container) to FleetUpdate-Hub.

---

## 1. Generate a Long-Lived Access Token (LLAT)

1. Log in to your Home Assistant dashboard (typically `http://homeassistant.local:8123` or `http://<HA_IP>:8123`).
2. Click on your **User Profile** (bottom-left avatar on the sidebar).
3. Scroll down to the **Long-Lived Access Tokens** section.
4. Click **Create Token**:
   - Token Name: `FleetUpdate-Hub`
   - Copy the generated token string (`eyJhbGciOi...`).

---

## 2. Configure in FleetUpdate-Hub

In the FleetUpdate-Hub dashboard, click **Add Host**:

- **Name**: `Home Assistant Production`
- **Type**: `HOME_ASSISTANT`
- **Endpoint URL**: `http://192.168.1.100:8123` (or `https://` if using Nabu Casa / Reverse Proxy)
- **Access Token**: Paste your Long-Lived Access Token.
- **Target Entity ID (Optional)**: 
  - Leave empty to automatically discover and orchestrate all pending native updates (Core, OS, Supervisor, Add-ons, HACS).
  - Or target a specific entity (e.g. `update.home_assistant_core_update`).

---

## 3. Adapter Capabilities & Safety Controls

- **Smart Entity Filtering**:
  - Automatically isolates native Home Assistant components (`Core`, `OS`, `Supervisor`, `Add-ons`, `HACS`) from external sensor-based notifications (e.g. WUD / What's Up Docker / Portainer).
- **Automated Pre-Update Snapshots**:
  - Automatically triggers a native Home Assistant Supervisor snapshot before deploying updates.
- **Reboot Cycle Awareness**:
  - Flags updates requiring subsequent host/core restarts and audits system availability post-deployment.

