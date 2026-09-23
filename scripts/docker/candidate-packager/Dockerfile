# syntax=docker/dockerfile:1.7

# Pinned, network-isolated build image that packs a candidate source archive
# into candidate.tgz for the install-smoke candidate payload.
FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

# Packager images are pinned and short-lived, so skip distro upgrades here.
RUN --mount=type=cache,id=openclaw-candidate-packager-apt-cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,id=openclaw-candidate-packager-apt-lists,target=/var/lib/apt,sharing=locked \
  set -eux; \
  for attempt in 1 2 3; do \
    if apt-get update -o Acquire::Retries=3; then break; fi; \
    echo "apt-get update failed (attempt ${attempt})" >&2; \
    if [ "${attempt}" -eq 3 ]; then exit 1; fi; \
    sleep 3; \
  done; \
  apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    g++ \
    make \
    python3 \
    sudo
