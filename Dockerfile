# This file is auto-synced from product-os/jellyfish-config/sync/Dockerfile
# and should only be edited there!
FROM resinci/jellyfish-test:v1.4.2

WORKDIR /usr/src/jellyfish

COPY package.json .npmrc ./
ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> ~/.npmrc && \
    npm i && rm -f ~/.npmrc

COPY . ./

CMD /bin/bash -c "task test"
