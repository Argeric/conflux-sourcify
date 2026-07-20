FROM node:22.22.0-trixie AS base

RUN apt-get update && \
    apt-get install -y --no-install-recommends iputils-ping && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /verification

FROM base AS builder

ENV RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
ENV RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustc --version && cargo --version

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /verification

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /verification/server.js ./server.js
COPY --from=builder /verification/common ./common
COPY --from=builder /verification/config ./config
COPY --from=builder /verification/routes ./routes
COPY --from=builder /verification/services ./services

CMD ["node", "server.js"]


