# syntax=docker/dockerfile:1

FROM resinci/jellyfish-test:v2.0.5

WORKDIR /usr/src/jellyfish

COPY package.json .npmrc ./
RUN npm install

COPY . ./

CMD /bin/bash -c "task test"
