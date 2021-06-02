FROM node:14

WORKDIR /usr/src/jellyfish

COPY package.json package-lock.json /usr/src/jellyfish/
ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc && \
    npm ci && rm -f ~/.npmrc

COPY . .

CMD /bin/bash -c "npm run integration"
