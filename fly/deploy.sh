#!/usr/bin/env bash
# Deploy the beeatlas Fly app from this checkout (beeatlas-z1b3, ADR 0042). The shape of
# salishsea's fly/deploy.sh.
#
#   fly/deploy.sh          build the image, then switch the Machine to it
#   fly/deploy.sh build    build and push the image only; production is untouched
#   fly/deploy.sh switch   take the publish lock and deploy the image `build` pushed
#
# The Fly Deploy workflow runs it by hand (workflow_dispatch) until cutover, and on
# every push to main after (beeatlas-j65i).
#
# Why the lock. A deploy replaces the one Machine in place, which stops whatever it was
# doing. The nightly, a note publish and the post-deploy render serialize on the
# publish lock, $VAR_DIR/publish.lock; a deployer from outside the Machine was not one of
# them. So `switch` takes that lock on the Machine first, waiting out a running nightly
# (LOCK_WAIT, longer than any nightly has taken), and holds it while Fly replaces the
# Machine. The new Machine's first boot renders the site under the same lock.
#
# Two layers stand behind it. A stop that does land mid-nightly gives the nightly
# SIGTERM and kill_timeout, 300 s, for its backup (fly/start.sh). And a publish killed
# at any point leaves a site that serves (data/merge-swap.sh says why).
#
# flyctl by that name: the workflow's setup-flyctl installs no `fly` alias.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE=${1:-all}
case "$MODE" in
    all|build|switch) ;;
    *) echo "usage: fly/deploy.sh [build|switch]" >&2; exit 2 ;;
esac

STELIS_SHA=$(tr -d '[:space:]' < fly/stelis-commit)
STELIS_DIGEST=$(tr -d '[:space:]' < fly/stelis-digest)
if ! [[ "$STELIS_SHA" =~ ^[0-9a-f]{40}$ && "$STELIS_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "fly/stelis-commit and fly/stelis-digest must hold a commit and an image digest; run fly/pin-stelis.sh" >&2
    exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
    echo "refusing to deploy uncommitted work: the image would not match any commit" >&2
    exit 1
fi

APP=${FLY_APP:-beeatlas}
SHA=$(git rev-parse HEAD)
# The tag names both pins, so a rerun at another Stelis commit cannot overwrite an image.
LABEL="$SHA-stelis-${STELIS_SHA:0:12}"
IMAGE="registry.fly.io/$APP:$LABEL"

build() {
    # On Fly's remote builder, while the Machine goes on working: the lock is held only
    # for the switch.
    flyctl deploy -a "$APP" --build-only --push --image-label "$LABEL" \
        --build-arg GITHUB_SHA="$SHA" \
        --build-arg STELIS_SHA="$STELIS_SHA" \
        --build-arg STELIS_IMAGE="ghcr.io/rainhead/stelis@$STELIS_DIGEST"
}

switch() {
    # The first deploy has no Machine to take the lock on, and nothing running that a
    # deploy could cut off.
    # A failed listing must not read as "no Machine", which would skip the lock.
    machines=$(flyctl machines list -a "$APP" -q) || {
        echo "could not list $APP's Machines; not deploying without knowing whether to take the lock" >&2
        exit 1
    }
    if [ -z "$machines" ]; then
        echo "no Machine yet: the first deploy needs no lock"
        flyctl deploy -a "$APP" --ha=false --image "$IMAGE"
        return
    fi

    # Take the publish lock on the Machine and hold it from a session that outlives this
    # one (killing the local `flyctl ssh` leaves the remote side running), so it lets go
    # by itself after HOLD seconds; a deploy that fails before the Machine is replaced
    # lets go at once. Replacing the Machine ends the hold with it.
    #
    # The deploy is bounded to end two minutes before the hold can (DEPLOY_LIMIT), so
    # the lock is held for the whole switch however long flyctl retries: a deploy that
    # would outlast it fails instead, and the hold then lets go by itself.
    HOLD=1800 LOCK_WAIT=${LOCK_WAIT:-7200}
    DEPLOY_LIMIT=$((HOLD - 120))
    HOLDER="deploy-hold-$SHA-$$"   # names this deploy's hold alone, to release it
    lock_log=$(mktemp)
    # As app, like everything on the Machine: `flyctl ssh` is root, and a lock file it
    # created would be root's, which the nightly could then not open.
    flyctl ssh console -a "$APP" \
        -C "setpriv --reuid=app --regid=app --init-groups flock -o -w $LOCK_WAIT /data/var/publish.lock timeout $HOLD sh -c 'echo held; sleep $HOLD' $HOLDER" \
        > "$lock_log" 2>&1 &
    hold_pid=$!
    deployed=
    release() {
        kill "$hold_pid" 2> /dev/null || true
        [ -n "$deployed" ] || timeout 60 flyctl ssh console -a "$APP" -C "pkill -f $HOLDER" > /dev/null 2>&1 || true
        rm -f "$lock_log"
    }
    trap release EXIT
    echo "waiting for the publish lock on $APP (a running nightly holds it until it ends)..."
    # A local deadline too, with a minute's slack for the SSH connection: a session that
    # stalls before the remote flock starts would otherwise wait with no end.
    deadline=$((SECONDS + LOCK_WAIT + 60))
    until grep -q '^held' "$lock_log"; do
        if ! kill -0 "$hold_pid" 2> /dev/null; then
            cat "$lock_log" >&2
            echo "could not take the publish lock within ${LOCK_WAIT}s; is a publish stuck? The image is pushed: rerun fly/deploy.sh switch" >&2
            exit 1
        fi
        if [ "$SECONDS" -ge "$deadline" ]; then
            echo "no publish lock within ${LOCK_WAIT}s; the SSH session may not have reached the lock. The image is pushed: rerun fly/deploy.sh switch" >&2
            exit 1
        fi
        sleep 5
    done
    echo "holding the publish lock; deploying $IMAGE"

    timeout "$DEPLOY_LIMIT" flyctl deploy -a "$APP" --ha=false --image "$IMAGE" --wait-timeout 10m
    deployed=1
}

[ "$MODE" = switch ] || build
[ "$MODE" = build ] || switch
