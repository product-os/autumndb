# syntax=docker/dockerfile:1

FROM resinci/jellyfish-test:v1.4.24

WORKDIR /usr/src/jellyfish

COPY package.json .npmrc ./
RUN npm install

COPY . ./

CMD /bin/bash -c "task test"
