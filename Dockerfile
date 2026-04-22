FROM node:22.22.0

# install iputils-ping
RUN apt-get update && \
    apt-get install -y --no-install-recommends libssl3 && \
    rm -rf /var/lib/apt/lists/*

# set workspace
WORKDIR /verification

# install dependencies
COPY package*.json ./
RUN npm install

# compile
COPY . .
RUN npm run build

CMD ["node"]
