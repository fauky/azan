#!/bin/bash

# ==============================================================================
# Azan Dashboard — Installation Script
# ==============================================================================
# This script sets up the environment, installs dependencies, configures the
# service user, downloads necessary assets, and installs systemd services.
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Check if script is run as root, automatically re-run with sudo if not
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run as root. Re-running with sudo..."
    exec sudo "$0" "$@"
fi

# ------------------------------------------------------------------------------
# Configuration & Constants
# ------------------------------------------------------------------------------

# Installation Paths
SOURCE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INSTALL_DIR="/opt/azan"
FONTS_DIR="${INSTALL_DIR}/static/fonts"
SYSTEM_FONTS_DIR="/usr/local/share/fonts/azan"

# Service User Configuration
SERVICE_USER="azan"
SERVICE_GROUP="azan"
SERVICE_USER_UID="1111"

# External Resources
URL_FONT_CINZEL="https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel[wght].ttf"
URL_FONT_SHARETECH="https://raw.githubusercontent.com/google/fonts/main/ofl/sharetechmono/ShareTechMono-Regular.ttf"
URL_FONT_AMIRI_REG="https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf"
URL_FONT_AMIRI_BOLD="https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Bold.ttf"
URL_LIB_ADHAN="https://cdn.jsdelivr.net/npm/adhan@4.4.3/lib/bundles/adhan.umd.js"

# System Dependencies
DEPENDENCIES=(
  curl htop rsync cage chromium wlr-randr wayvnc
  libgl1-mesa-dri mesa-vulkan-drivers mesa-va-drivers libdrm-amdgpu1
  pulseaudio-utils libvulkan1 vulkan-tools python3
  alsa-utils pipewire pipewire-pulse pipewire-alsa wireplumber
  grim mpg123 fontconfig fonts-hosny-amiri fonts-noto-color-emoji
)

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------

log_step() {
  echo "-> $1"
}

download_resource() {
  local url="$1"
  local dest="$2"
  if [ ! -s "$dest" ]; then
    echo "   Downloading $(basename "$dest")..."
    curl -L -s -f -o "$dest" "$url"
  else
    echo "   $(basename "$dest") already exists."
  fi
}

# ------------------------------------------------------------------------------
# Main Installation Steps
# ------------------------------------------------------------------------------

echo "Installing Azan Dashboard Services"
echo "  Source: $SOURCE_DIR"
echo "  Target: $INSTALL_DIR"
echo "  User:   $SERVICE_USER"

# 1. Install System Dependencies
log_step "Updating system and installing dependencies..."
apt update && apt upgrade -y
apt install -y "${DEPENDENCIES[@]}"

# 2. Configure Audio (Client-only mode)
log_step "Disabling local PipeWire services (client-only mode)..."
# Disable PipeWire services to prevent conflicts with host socket
systemctl --global mask pipewire.service pipewire.socket \
  pipewire-pulse.service pipewire-pulse.socket wireplumber.service

# 3. Configure Service User
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log_step "Creating system user '$SERVICE_USER'..."
  # Create a system user with a valid shell
  groupadd --system -g "$SERVICE_USER_UID" "$SERVICE_GROUP"
  useradd --system -u "$SERVICE_USER_UID" -g "$SERVICE_USER_UID" \
    -s /bin/bash -d "$INSTALL_DIR" "$SERVICE_USER"
fi

log_step "Adding $SERVICE_USER to required hardware groups..."
# Add to video/render/audio groups for Wayland/DRM/Sound access
for grp in video render input tty audio; do
  if getent group "$grp" >/dev/null; then
    usermod -a -G "$grp" "$SERVICE_USER"
  fi
done

# Also add root to audio group so debugging (speaker-test) works as root
if getent group audio >/dev/null; then
  usermod -a -G audio root
fi

log_step "Enabling linger for $SERVICE_USER to start audio services..."
# Enable lingering for the user to allow user services (like PipeWire) to start on boot
loginctl enable-linger "$SERVICE_USER"

# 4. Install Application Files
if [ "$SOURCE_DIR" != "$INSTALL_DIR" ]; then
  log_step "Copying files to $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
  cp -R "$SOURCE_DIR/"* "$INSTALL_DIR/"
fi

log_step "Setting ownership of $INSTALL_DIR to $SERVICE_USER..."
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"

log_step "Making start-kiosk.sh executable..."
chmod +x "$INSTALL_DIR/start-kiosk.sh"

# Cleanup: Remove the old python script if it was copied
if [ -f "$INSTALL_DIR/download_fonts.py" ]; then
  rm "$INSTALL_DIR/download_fonts.py"
fi

# 5. Download External Resources
log_step "Downloading external resources..."
mkdir -p "$FONTS_DIR"

# Download Fonts
download_resource "$URL_FONT_CINZEL"     "$FONTS_DIR/Cinzel-Variable.ttf"
download_resource "$URL_FONT_SHARETECH"  "$FONTS_DIR/ShareTechMono-Regular.ttf"
download_resource "$URL_FONT_AMIRI_REG"  "$FONTS_DIR/Amiri-Regular.ttf"
download_resource "$URL_FONT_AMIRI_BOLD" "$FONTS_DIR/Amiri-Bold.ttf"

# Download Adhan Library
download_resource "$URL_LIB_ADHAN"       "$INSTALL_DIR/static/adhan.umd.js"

# 6. Install System Fonts
if [ -d "$FONTS_DIR" ]; then
  log_step "Installing custom fonts to $SYSTEM_FONTS_DIR..."
  mkdir -p "$SYSTEM_FONTS_DIR"
  cp "$FONTS_DIR/"*.ttf "$SYSTEM_FONTS_DIR/" 2>/dev/null || true
  fc-cache -f -v
fi

# 7. Create Systemd Services
log_step "Creating /etc/systemd/system/azan-dashboard.service..."
cat <<EOF | tee /etc/systemd/system/azan-dashboard.service > /dev/null
[Unit]
Description=Azan Dashboard Server
After=network.target

[Service]
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/server.py --host 0.0.0.0 --port 8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

log_step "Creating /etc/systemd/system/azan-kiosk.service..."
cat <<EOF | tee /etc/systemd/system/azan-kiosk.service > /dev/null
[Unit]
Description=Azan Dashboard Kiosk
After=network.target azan-dashboard.service

[Service]
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$INSTALL_DIR

# The user's runtime dir is created by systemd-logind for a lingered user
Environment="XDG_RUNTIME_DIR=/run/user/$SERVICE_USER_UID"
ExecStart=$INSTALL_DIR/start-kiosk.sh

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

log_step "Creating /etc/systemd/system/azan-vnc.service..."
cat <<EOF | tee /etc/systemd/system/azan-vnc.service > /dev/null
[Unit]
Description=VNC Server for Azan Kiosk
After=azan-kiosk.service
Requires=azan-kiosk.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP

# The user's runtime dir is created by systemd-logind for a lingered user
Environment="XDG_RUNTIME_DIR=/run/user/$SERVICE_USER_UID"
Environment=WAYLAND_DISPLAY=wayland-0

# Add a delay to wait for Cage to start and create the Wayland socket.
# This prevents a race condition on startup where wayvnc fails to find the display.
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/wayvnc 0.0.0.0 5900

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 8. Enable Services
log_step "Reloading systemd..."
systemctl daemon-reload

log_step "Enabling services..."
systemctl enable azan-dashboard.service
systemctl enable azan-kiosk.service
# systemctl enable azan-vnc.service

echo "Installation Complete"
echo "To start everything now, run:"
echo "  systemctl start azan-dashboard.service"
echo "  systemctl start azan-kiosk.service"
echo "  systemctl start azan-vnc.service"

cat <<'INSTRUCTIONS'

========================================================================
== Proxmox Host Configuration for seatd in LXC
========================================================================
If you are running this dashboard inside a Proxmox LXC, you must
configure the Proxmox HOST to install and share its 'seatd' service
with this container.

Please execute the following commands on the PROXMOX HOST:

1. Install 'seatd':
   apt update && apt install -y seatd

2. Configure 'seatd' to use the 'video' group (GID 44):
   systemctl edit seatd.service

   Paste the following lines into the editor, then save and close:
   [Service]
   ExecStart=
   ExecStart=seatd -g video

3. Apply the changes and restart the service:
   systemctl daemon-reload
   systemctl restart seatd.service

4. Allow the host to map GID 44 (video) and GID 29 (audio) to the container.
   nano /etc/subgid
   Add these lines:
   root:29:1
   root:44:1

5. Configure the LXC to map the groups and mount the socket.
   Edit your LXC's configuration file (replace VMID with the actual ID):
   nano /etc/pve/lxc/VMID.conf

   Add the following lines to the end of the file:
   lxc.idmap: u 0 100000 65536
   lxc.idmap: g 0 100000 29
   lxc.idmap: g 29 29 1
   lxc.idmap: g 30 100030 14
   lxc.idmap: g 44 44 1
   lxc.idmap: g 45 100045 65491
   lxc.mount.entry: /run/seatd.sock opt/seatd.sock none bind,create=file 0 0

6. Finally, restart your LXC container for the changes to take effect.

========================================================================
== Proxmox Host Configuration for PipeWire Socket Sharing
========================================================================
To enable audio, we run PipeWire as a system-wide service on the Host and
share its socket with the LXC container.

1. Install PipeWire on the PROXMOX HOST:
   apt update && apt install pipewire pipewire-pulse wireplumber

2. Create a dedicated system user for PipeWire:
   useradd -r -s /usr/sbin/nologin -G audio,video pipewire

3. Create systemd service files to run PipeWire as a system service.
   Run the following commands on the HOST:

   # 1. PipeWire Service
   cat <<EOF > /etc/systemd/system/pipewire.service
   [Unit]
   Description=PipeWire System Service
   After=network.target

   [Service]
   Type=simple
   User=pipewire
   Group=pipewire
   RuntimeDirectory=pipewire
   Environment=XDG_RUNTIME_DIR=/run/pipewire
   ExecStart=/usr/bin/pipewire
   # Ensure socket is accessible by the container (chmod 666)
   ExecStartPost=/bin/bash -c "until [ -S /run/pipewire/pipewire-0 ]; do sleep 0.1; done; chmod 666 /run/pipewire/pipewire-0"
   Restart=always

   [Install]
   WantedBy=multi-user.target
   EOF

   # 2. WirePlumber Service (Session Manager)
   cat <<EOF > /etc/systemd/system/wireplumber.service
   [Unit]
   Description=WirePlumber System Service
   After=pipewire.service
   BindsTo=pipewire.service

   [Service]
   Type=simple
   User=pipewire
   Group=pipewire
   RuntimeDirectory=pipewire
   Environment=XDG_RUNTIME_DIR=/run/pipewire
   ExecStart=/usr/bin/wireplumber
   Restart=always

   [Install]
   WantedBy=multi-user.target
   EOF

   # 3. Enable and start services
   systemctl daemon-reload
   systemctl enable --now pipewire wireplumber

4. Edit your LXC configuration (/etc/pve/lxc/VMID.conf) to bind mount
   the system socket to /opt/pipewire-0:
   lxc.mount.entry: /run/pipewire/pipewire-0 opt/pipewire-0 none bind,create=file 0 0

5. Restart the container.
========================================================================
INSTRUCTIONS
