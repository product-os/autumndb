# syntax=docker/dockerfile:1

FROM node:20

WORKDIR /usr/src/jellyfish

COPY package.json .npmrc ./
RUN npm install

COPY . ./

CMD /bin/bash -c "npm run test:integration"
