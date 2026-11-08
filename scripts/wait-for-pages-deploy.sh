#!/usr/bin/env bash
# Waits for Cloudflare Pages to deploy a commit on a branch and writes the
# deploy's own preview URL (<hash>.deejaytools-com.pages.dev) to
# $GITHUB_OUTPUT as `site`.
#
# Usage: bash scripts/wait-for-pages-deploy.sh <branch> <commit>
# Needs GH_TOKEN and GITHUB_REPOSITORY, as in GitHub Actions, and a token
# that can read checks.
#
# Pages builds on its own, outside Actions, and reports through the
# "Cloudflare Pages" check on the commit. It builds only the newest commit on
# a branch, so once the branch has moved past the commit to one that contains
# it, this follows that commit's deploy. Gives up after 15 minutes.
set -euo pipefail

branch=$1
commit=$2

check() {
  gh api "repos/$GITHUB_REPOSITORY/commits/$commit/check-runs?check_name=Cloudflare%20Pages" --jq "$1"
}

# True when the branch is on a newer commit that contains $commit, left in $head.
moved_on() {
  head=$(gh api "repos/$GITHUB_REPOSITORY/commits/$branch" --jq .sha)
  [ "$head" != "$commit" ] \
    && [ "$(gh api "repos/$GITHUB_REPOSITORY/compare/$commit...$head" --jq .status)" = ahead ]
}

for _ in $(seq 1 60); do
  read -r status conclusion <<<"$(check '.check_runs[0] // {} | "\(.status // "missing") \(.conclusion // "")"')"
  if [ "$status" = completed ] && [ "$conclusion" = success ]; then
    # The check's summary lists the deploy's own preview URL first, before
    # the branch alias.
    url=$(check '.check_runs[0].output.summary' | grep -oE 'https://[a-z0-9]+\.deejaytools-com\.pages\.dev' | head -n 1 || true)
    if [ -z "$url" ]; then echo "::error::The Cloudflare Pages check did not report a preview URL."; exit 1; fi
    echo "Deployed $commit at $url."
    echo "site=$url" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  if moved_on; then
    echo "$branch moved on to $head, which contains $commit; following its deploy."
    commit=$head
    continue
  fi
  if [ "$status" = completed ]; then
    echo "::error::The Cloudflare Pages deploy of $commit concluded '$conclusion'."
    exit 1
  fi
  sleep 15
done
echo "::error::No finished Cloudflare Pages deploy for $commit after 15 minutes."
exit 1
