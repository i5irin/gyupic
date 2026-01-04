ARG NODE_IMAGE="mcr.microsoft.com/devcontainers/typescript-node:1-20-bullseye"
FROM ${NODE_IMAGE}

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
    # Rust toolchain (stable) + wasm32 target
    curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain stable --profile minimal; \
    . "$CARGO_HOME/env"; \
    rustup target add wasm32-unknown-unknown; \
    # Build-from-source to avoid glibc mismatch of prebuilt wasm-bindgen
    cargo install wasm-bindgen-cli --version 0.2.106 --locked; \
    # Keep wasm-pack for wasm-pack build workflow
    cargo install wasm-pack --locked; \
    chown -R node:node "$RUSTUP_HOME" "$CARGO_HOME"

# Ensure wasm-pack picks up the locally built wasm-bindgen
ENV WASM_BINDGEN_PATH=/usr/local/cargo/bin/wasm-bindgen
