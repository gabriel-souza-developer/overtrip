#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y prometheus-node-exporter
sudo install -D -m 0644 deploy/monitoring/prometheus-node-exporter.service.d.conf \
  /etc/systemd/system/prometheus-node-exporter.service.d/overtrip.conf
sudo systemctl daemon-reload
sudo systemctl enable --now prometheus-node-exporter
sudo systemctl restart prometheus-node-exporter
sudo systemctl --no-pager --full status prometheus-node-exporter
