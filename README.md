# Remote ADB Tool

A CLI utility to expose and connect to Android devices over the network (LAN or WAN via SSH).

## Installation

1.  Clone this repository.
2.  Run `npm install`.
3.  Build with `npm run build`.
4.  Link globally (optional): `npm link`.

## Usage

### 1. On the Gateway Machine (e.g., Home PC)

Connect your Android devices via USB and run:

```bash
# Start the daemon
adb-remote serve
```

This will:
*   Detect connected USB devices.
*   Enable ADB TCP/IP mode (port 5555).
*   Forward a unique local port (starting 15000) to the device.
*   Start a proxy server to expose that port to the network.

### 2. On the Client Machine (e.g., Office Laptop)

Ensure you have SSH access to the Gateway machine.

```bash
# Connect to the gateway
adb-remote connect user@192.168.1.5
```

This will:
*   Fetch the list of available devices from the Gateway.
*   Show an interactive menu to Select/Deselect devices.
*   Automatically set up SSH tunnels (forwarding local -> remote).
*   Run `adb connect localhost:<port>` for you.

### 3. Verify

```bash
adb devices
```

You should see the remote devices listed as `localhost:15000`, etc.
