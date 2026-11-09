#!/usr/bin/env bash
# Waits until the development API serves api-deejaytools' latest dev commit,
# so the live contract suite meets the API that dev's code describes rather
# than the deploy it is replacing.
#
# Usage: bash scripts/wait-for-api-deploy.sh <api-base-url>
# Needs GH_TOKEN, as in GitHub Actions; api-deejaytools is public, so the
# workflow's own token can read it.
#
# The API reports the commit it was built from at GET /version (`commit`).
# Every commit to api-deejaytools' dev deploys, so the wait ends once that
# deploy is live. dev's head is read again on every try, so a newer push
# during the wait is followed. Gives up after 15 minutes: an API dev deploy
# that has not gone live by then has failed, and the suite would only
# report it as contract failures.
set -euo pipefail

api=${1%/}
case "$api" in http://*|https://*) ;; *) api="https://$api" ;; esac
repo=mini-app-polis/api-deejaytools

for _ in $(seq 1 60); do
  want=$(gh api "repos/$repo/commits/dev" --jq .sha)
  have=$(curl -fsS --max-time 10 "$api/version" 2>/dev/null | jq -r '.commit // empty' 2>/dev/null || true)
  if [ "$have" = "$want" ]; then
    echo "The dev API serves $repo@dev ($want)."
    exit 0
  fi
  echo "The dev API serves ${have:-an unknown commit}; waiting for $repo@dev ($want) to go live."
  sleep 15
done
echo "::error::The dev API did not serve $repo@dev within 15 minutes: check its Railway deploy."
exit 1
