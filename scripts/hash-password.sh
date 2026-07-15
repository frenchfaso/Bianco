#!/bin/sh
set -eu

runtime=${CONTAINER_RUNTIME:-docker}
image=bianco-password-hasher

"$runtime" build --target production -t "$image" ./server
"$runtime" run --rm -it "$image" python -m app.cli.hash_password
