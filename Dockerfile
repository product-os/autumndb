# syntax=docker/dockerfile:1

# This file is auto-synced from product-os/jellyfish-config/sync/Dockerfile
# and should only be edited there!
FROM resinci/jellyfish-test:v1.4.12

WORKDIR /usr/src/jellyfish

COPY package.json .npmrc ./
RUN --mount=type=secret,id=npmrc set -eux \
	&& ln -s /run/secrets/npmrc ~/.npmrc \
	&& npm i && rm ~/.npmrc

COPY . ./

CMD /bin/bash -c "task test"
