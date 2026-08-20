# OPNsense Configuration Guide for FleetUpdate-Hub (Principle of Least Privilege)

To allow FleetUpdate-Hub to audit and execute firmware upgrades without requiring super-administrator credentials:

## 1. Create a Restricted Group
1. In the OPNsense WebGUI, navigate to: **System** $\rightarrow$ **Access** $\rightarrow$ **Groups**.
2. Click **+** to add a new group:
   - **Group name**: `FleetUpdate-Admins`
   - **Description**: `Service API account for FleetUpdate-Hub`
3. In the **Assigned Privileges** section, select the following privilege:
   - **`System: Firmware`** *(Unlocks full REST API access to `/api/core/firmware/*`: checks, statuses, upgrades, and live logs)*
   - *(Optional)* **`Diagnostics: Reboot`** *(If you wish to allow automatic reboots after kernel updates)*
   - *(Optional)* **`System: Information`** *(For general dashboard system telemetry)*
4. Click **Save**.

## 2. Create the Dedicated API User
1. Navigate to: **System** $\rightarrow$ **Access** $\rightarrow$ **Users**.
2. Click **+**:
   - **Username**: `fleetupdate-svc`
   - **Password**: (Generate a strong temporary password)
   - **Member of**: Check `FleetUpdate-Admins`
3. Click **Save**.

## 3. Generate API Key & Secret Pair
1. On the user profile page for `fleetupdate-svc`, scroll down to the **API Keys** section.
2. Click the **+** (Create API key) button.
3. Your browser will download a file named `API_KEY.txt` containing:
   ```ini
   key=xxxxxxxxxxxxxxxxxxxx
   secret=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
   ```
4. Copy and paste the `key` and `secret` into the encrypted **FleetUpdate-Hub** credentials vault.

