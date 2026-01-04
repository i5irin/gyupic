ARG NODE_IMAGE="mcr.microsoft.com/devcontainers/typescript-node:1-20-bullseye"
FROM ${NODE_IMAGE}

ARG RUST_VERSION="stable"
ARG WASM_BINDGEN_VERSION="0.2.106"
ARG WASM_PACK_VERSION="0.12.1"

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:${PATH}

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      build-essential \
      pkg-config \
      libssl-dev; \
    rm -rf /var/lib/apt/lists/*; \
    curl https://sh.rustup.rs -sSf \
      | sh -s -- -y --default-toolchain "${RUST_VERSION}" --profile minimal; \
    . "$CARGO_HOME/env"; \
    rustup default "${RUST_VERSION}"; \
    rustup target add wasm32-unknown-unknown --toolchain "${RUST_VERSION}"; \
    cargo install wasm-bindgen-cli --version "${WASM_BINDGEN_VERSION}" --locked; \
    cargo install wasm-pack --version "${WASM_PACK_VERSION}" --locked; \
    chown -R node:node "$RUSTUP_HOME" "$CARGO_HOME"

# Ensure wasm-pack picks up the locally built wasm-bindgen
ENV WASM_BINDGEN_PATH=/usr/local/cargo/bin/wasm-bindgen
