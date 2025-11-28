# Remote ADB Tool Implementation Plan

## Objective
Create a user-friendly CLI tool (`adb-remote`) that allows a "Gateway" computer to share connected USB Android devices with a "Client" computer securely over SSH.
The Client experience is interactive: users see a list of devices, select one, and it magically appears in their local ADB.

## Core Logic

### Gateway (Home)
*   **Role:** Expose physical devices to localhost ports.
*   **Mechanism:**
    1.  Detect USB device.
    2.  `adb tcpip 5555` (Restart adbd on phone).
    3.  `adb forward tcp:X tcp:5555` (Bridge Phone to Gateway Localhost).
    4.  **TCP Proxy:** Listen on `0.0.0.0:X` -> Pipe to `127.0.0.1:X` (Expose to network).

### Client (Office)
*   **Role:** Tunnel to Gateway and attach devices.
*   **Mechanism:**
    1.  **Discovery:** `ssh <host> "adb-remote list --json"` to get real-time device map.
    2.  **Interactive UI:** Show list of devices with status (Connected/Available).
    3.  **Action:**
        *   **Connect:** Spawn `ssh -L <local_port>:127.0.0.1:<remote_port> -N` background process & `adb connect localhost:<local_port>`.
        *   **Disconnect:** `adb disconnect localhost:<local_port>` & Kill SSH tunnel process.

## Architecture

### Technology Stack
*   **Runtime:** Node.js (TypeScript).
*   **CLI Framework:** `commander` + `inquirer` (or `prompts`) for interactive selection.
*   **Process Mgmt:** `execa` (ADB/SSH execution).
*   **State persistence:** `conf` or simple JSON file (to remember active tunnels).

### Modules

1.  **`GatewayDaemon`** (Home)
    *   Watches USB devices.
    *   Maintains a persistent registry of `Serial -> Port`.
    *   Runs the TCP Proxy servers.

2.  **`ClientSession`** (Office)
    *   **`RemoteLister`**: Fetches device list from Gateway.
    *   **`TunnelManager`**:
        *   Starts/Stops `ssh -L` processes.
        *   Keeps track of PIDs to kill them cleanly.
    *   **`LocalAdb`**: Runs `adb connect/disconnect`.

3.  **`InteractiveCLI`**
    *   Displays the dashboard:
        ```text
        ? Select devices to connect (Press <space> to toggle, <a> to toggle all, <i> to invert selection)
        > [X] Google Pixel 6 (192.168.1.50:15000) [Connected]
          [ ] Samsung S21    (192.168.1.50:15002)
        ```

## Step-by-Step Implementation

### Phase 1: Project Scaffold
1.  Init Node.js + TypeScript.
2.  Install `commander`, `prompts`, `execa`, `chalk`.
3.  Configure `bin` entry point as `adb-remote`.

### Phase 2: Gateway (Server)
1.  `DeviceMonitor`: Wrapper around `adb track-devices`.
2.  `PortProxy`: The Logic to `tcpip` -> `forward` -> `net.createServer`.
3.  `serve` command: Starts this daemon.

### Phase 3: Client (Interactive)
1.  `ssh-fetch`: Helper to run commands on remote host.
2.  `tunnel-control`: Helper to spawn/kill SSH tunnels.
3.  `menu`: The interactive prompt loop.
    *   Fetch list.
    *   Read local state (active tunnels).
    *   Show Menu.
    *   Apply Diff (Connect new selections, Disconnect unselected).

## Usage

1.  **Home:**
    ```bash
    $ adb-remote serve
    ```
2.  **Office:**
    ```bash
    $ adb-remote connect user@my-home-pc.com
    ```
    *(Shows interactive list. User picks device. Exits.)*
    ```bash
    $ adb devices
    List of devices attached
    localhost:15000    device
    ```
