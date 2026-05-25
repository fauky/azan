#!/bin/bash

# ==============================================================================
# Azan Dashboard — Screenshot Utility
# ==============================================================================
# Captures a screenshot of the active Wayland session (Cage/Chromium).
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# ------------------------------------------------------------------------------
# Configuration & Constants
# ------------------------------------------------------------------------------

# Service User Configuration
SERVICE_USER="azan"
SERVICE_GROUP="azan"
SERVICE_UID="1111"

# Wayland Environment
RUNTIME_DIR="/run/user/${SERVICE_UID}"
WAYLAND_DISPLAY_ID="wayland-0"

# Output Configuration
SCREENSHOT_DIR="/opt/azan/screenshots"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
FILENAME="${SCREENSHOT_DIR}/${TIMESTAMP}_Azan.png"

# ------------------------------------------------------------------------------
# Main Execution
# ------------------------------------------------------------------------------

# Ensure storage directory exists with correct permissions
sudo mkdir -p "$SCREENSHOT_DIR"
sudo chown "${SERVICE_USER}:${SERVICE_GROUP}" "$SCREENSHOT_DIR"

# Execute grim as the service user, targeting the specific Wayland socket
sudo -u "$SERVICE_USER" \
  XDG_RUNTIME_DIR="$RUNTIME_DIR" \
  WAYLAND_DISPLAY="$WAYLAND_DISPLAY_ID" \
  grim "$FILENAME"

echo "Screenshot saved to $FILENAME"
