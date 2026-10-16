#!/bin/sh
set -eu
# Mounted persistent disks may initially be root-owned. Repair the data directory,
# then run the application without root privileges.
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR"
exec su -s /bin/sh node -c 'exec node server.js'
