.PHONY: lint \
	test \
	test-unit \
	test-integration

# See https://stackoverflow.com/a/18137056
MAKEFILE_PATH := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# -----------------------------------------------
# Build Configuration
# -----------------------------------------------

# To make sure we don't silently swallow errors
NODE_ARGS = --abort-on-uncaught-exception --stack-trace-limit=100
NODE_DEBUG_ARGS = $(NODE_ARGS) --trace-warnings --stack_trace_on_illegal

# User parameters
FIX ?=
ifeq ($(FIX),)
ESLINT_OPTION_FIX =
else
ESLINT_OPTION_FIX = --fix
endif

AVA_ARGS = $(AVA_OPTS)
ifndef CI
AVA_ARGS += --fail-fast
endif
ifdef MATCH
AVA_ARGS += --match $(MATCH)
endif

# -----------------------------------------------
# Rules
# -----------------------------------------------

lint:
	./node_modules/.bin/eslint --ext .js $(ESLINT_OPTION_FIX) lib
	./scripts/check-filenames.sh
	./scripts/check-licenses.sh
	./scripts/check-deployable-lib.sh
	shellcheck ./scripts/*.sh
	./node_modules/.bin/deplint
	./node_modules/.bin/depcheck --ignore-bin-package

test:
	node $(NODE_DEBUG_ARGS) ./node_modules/.bin/ava -v $(AVA_ARGS) $(FILES)

test-unit:
	FILES="'./test/unit/**/*.spec.js'" make test

test-integration:
	FILES="'./test/integration/**/*.spec.js'" make test
