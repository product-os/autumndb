# This file is auto-synced from product-os/jellyfish-config/sync/Dockerfile
# and should only be edited there!
FROM balena/open-balena-base:v11.2.0

WORKDIR /usr/src/jellyfish

COPY package.json package-lock.json ./
ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc && \
    npm ci && rm -f ~/.npmrc

COPY . ./

CMD /bin/bash -c "npx ci-task-runner run --config /usr/src/jellyfish/test/ci-tasks.yml"
