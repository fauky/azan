#!/bin/bash

# screen.sh — Turn display ON or OFF
# Usage: ./screen.sh [on|off]

# Must match settings in start-kiosk.sh
DISPLAY_PORT="DP-1"
DISPLAY_RESOLUTION="800x480"
DISPLAY_ROTATION="90"

# Define the command to run wlr-randr with the correct user and environment
if [ "$(id -u)" -eq 0 ]; then
  # If running as root, impersonate azan user
  CMD="sudo -u azan XDG_RUNTIME_DIR=/run/user/1111 WAYLAND_DISPLAY=wayland-0 wlr-randr"
else
  # If running as azan, set environment
  export XDG_RUNTIME_DIR=/run/user/1111
  export WAYLAND_DISPLAY=wayland-0
  CMD="wlr-randr"
fi

case "$1" in
  off)
    $CMD --output "$DISPLAY_PORT" --off
    ;;
  on)
    $CMD --output "$DISPLAY_PORT" --on --transform "$DISPLAY_ROTATION" --mode "$DISPLAY_RESOLUTION"
    ;;
  *)
    echo "Usage: $0 {on|off}"
    exit 1
    ;;
esac
