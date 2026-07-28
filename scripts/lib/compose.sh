#!/usr/bin/env bash
# Détecte docker compose (avec ou sans sudo) — source depuis les autres scripts
if [[ -z "${COMPOSE_CMD:-}" ]]; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif sudo docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="sudo docker compose"
  else
    echo "✗ docker compose inaccessible (ajoutez l'utilisateur au groupe docker ou utilisez sudo)" >&2
    exit 1
  fi
fi

compose() {
  # shellcheck disable=SC2086
  $COMPOSE_CMD "$@"
}
