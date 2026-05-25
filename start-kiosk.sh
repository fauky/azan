#!/bin/bash

# ==============================================================================
# Azan Dashboard Kiosk Startup Script
# ==============================================================================
# Initializes the Wayland environment, configures audio socket forwarding,
# and launches the Cage compositor with Chromium in Kiosk mode.
# ==============================================================================

# ------------------------------------------------------------------------------
# Configuration & Constants
# ------------------------------------------------------------------------------

# User & Runtime Configuration
USER_UID="1111"
RUNTIME_DIR="/run/user/$USER_UID"

# Wayland & Seatd Environment
export XDG_RUNTIME_DIR="$RUNTIME_DIR"
export WAYLAND_DISPLAY="wayland-0"
export LIBSEAT_BACKEND="seatd"
export SEATD_SOCK="/opt/seatd.sock"
export WLR_BACKENDS="drm"
export WLR_LIBINPUT_NO_DEVICES="1"

# Display Settings
DISPLAY_PORT="DP-1"
DISPLAY_RESOLUTION="800x480"
DISPLAY_ROTATION="90"

# Audio Configuration
PIPEWIRE_HOST_SOCK="/opt/pipewire-0"
PIPEWIRE_LOCAL_SOCK="$RUNTIME_DIR/pipewire-0"

# Application Paths
CAGE_BIN="/usr/bin/cage"
CHROMIUM_BIN="/usr/bin/chromium"
WLR_RANDR_BIN="wlr-randr"

# Dashboard URL
DASHBOARD_URL="http://127.0.0.1:8080"

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------

#
# Function: ensure_pipewire_socket
# Description: Waits for the systemd-logind runtime directory and the host's
#              PipeWire socket, then creates a symlink to enable audio forwarding.
#              Runs in the background to prevent blocking startup.
#
ensure_pipewire_socket() {
  # 1. Wait for the user runtime directory (created by systemd-logind)
  #    Timeout: ~5 seconds (25 * 0.2s)
  for i in {1..25}; do
    if [ -d "$XDG_RUNTIME_DIR" ]; then
      break
    fi
    sleep 0.2
  done

  # 2. If runtime dir exists, wait for host socket and create symlink
  if [ -d "$XDG_RUNTIME_DIR" ]; then
    # Wait for host socket mount
    # Timeout: ~5 seconds (10 * 0.5s)
    for i in {1..10}; do
      if [ -S "$PIPEWIRE_HOST_SOCK" ]; then
        break
      fi
      sleep 0.5
    done

    # Create symlink if host socket is available
    if [ -S "$PIPEWIRE_HOST_SOCK" ]; then
      ln -sf "$PIPEWIRE_HOST_SOCK" "$PIPEWIRE_LOCAL_SOCK"
    fi
  fi
}

# ------------------------------------------------------------------------------
# Main Execution
# ------------------------------------------------------------------------------

# Initialize audio socket linking in background
ensure_pipewire_socket &

# Launch Cage Compositor
# Note: We wrap the internal command in a bash shell to execute screen rotation
# via wlr-randr *before* Chromium launches. This ensures the browser receives
# the correct viewport dimensions (Portrait) immediately on startup.
"$CAGE_BIN" -d -- /bin/bash -c "
  # 1. Configure Display Orientation
  $WLR_RANDR_BIN --output $DISPLAY_PORT \
    --transform $DISPLAY_ROTATION \
    --mode $DISPLAY_RESOLUTION

  # 2. Launch Chromium in Kiosk Mode
  exec $CHROMIUM_BIN \
    --enable-features=UseOzonePlatform \
    --autoplay-policy=no-user-gesture-required \
    --disable-features=CalculateNativeWinOcclusion \
    --ozone-platform=wayland \
    --kiosk \
    --disable-extensions \
    --incognito \
    --disable-infobars \
    --disk-cache-dir=/dev/null \
    --no-first-run \
    --window-position=0,0 \
    --force-device-scale-factor=1.0 \
    '$DASHBOARD_URL'
" &

# Capture Cage PID
CAGE_PID=$!

# Keep script alive as long as Cage is running
# If Cage exits/crashes, this script exits, allowing systemd to restart the service.
wait "$CAGE_PID"
