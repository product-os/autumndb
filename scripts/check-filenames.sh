#!/bin/bash

###
# Copyright (C) Balena.io - All Rights Reserved
# Unauthorized copying of this file, via any medium is strictly prohibited.
# Proprietary and confidential.
###

set -eu

DIRECTORIES=(lib scripts)

for file in $(find "${DIRECTORIES[@]}" -type f | grep -v -E node_modules); do
	BASENAME="$(basename "$file")"

	# Known exceptions
	if [ "$BASENAME" = "LICENSE" ] || [ "$BASENAME" = "README.md" ]; then
		continue
	fi

	# Everything that is all lowercase is fine
	if ! [[ $file =~ [A-Z] ]]; then
		continue
	fi

	echo "This file should not have capital letters:" 1>&2
	echo "" 1>&2
	echo "$file" 1>&2
	exit 1
done
