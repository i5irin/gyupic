ARG NODE_IMAGE="mcr.microsoft.com/devcontainers/typescript-node:1-20-bullseye"
FROM ${NODE_IMAGE}

ARG RUST_VERSION="stable"
ARG WASM_BINDGEN_VERSION="0.2.106"
ARG WASM_PACK_VERSION="0.13.1"

# The version 124 is chosen as a "relatively new" version for which aarch64-linux binaries are available.
ARG BINARYEN_VERSION="124"

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
      libssl-dev \
      perl \
      git \
      cmake; \
    rm -rf /var/lib/apt/lists/*

# Install binaryen from GitHub Releases (more stable than SourceForge)
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64|amd64) binaryen_platform="x86_64-linux" ;; \
      aarch64|arm64) binaryen_platform="aarch64-linux" ;; \
      *) echo "Unsupported architecture: $arch"; exit 1 ;; \
    esac; \
    base="https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}"; \
    pkg="binaryen-version_${BINARYEN_VERSION}-${binaryen_platform}.tar.gz"; \
    sha="${pkg}.sha256"; \
    tmpdir="$(mktemp -d)"; \
    curl -fL --retry 5 --retry-delay 2 \
      "${base}/${pkg}" \
      -o "$tmpdir/${pkg}"; \
    curl -fL --retry 5 --retry-delay 2 \
      "${base}/${sha}" \
      -o "$tmpdir/${sha}"; \
    # Normalize possible CRLF in checksum file (harmless if already LF)
    sed -i 's/\r$//' "$tmpdir/${sha}"; \
    (cd "$tmpdir" && sha256sum -c "${sha}"); \
    # Robustly detect top-level directory name inside the tarball
    topdir="$(tar -tzf "$tmpdir/${pkg}" | head -n 1 | cut -d/ -f1)"; \
    test -n "$topdir"; \
    tar -xzf "$tmpdir/${pkg}" -C "$tmpdir"; \
    rm -rf /usr/local/binaryen; \
    mv "$tmpdir/$topdir" /usr/local/binaryen; \
    ln -sf /usr/local/binaryen/bin/* /usr/local/bin/; \
    rm -rf "$tmpdir"

# Rust toolchain + wasm tooling
RUN set -eux; \
    curl -fL https://sh.rustup.rs -sSf \
      | sh -s -- -y --default-toolchain "${RUST_VERSION}" --profile minimal; \
    . "$CARGO_HOME/env"; \
    rustup default "${RUST_VERSION}"; \
    rustup target add wasm32-unknown-unknown --toolchain "${RUST_VERSION}"; \
    cargo install wasm-bindgen-cli --version "${WASM_BINDGEN_VERSION}" --locked; \
    cargo install wasm-pack --version "${WASM_PACK_VERSION}" --locked; \
    chown -R node:node "$RUSTUP_HOME" "$CARGO_HOME"

# Ensure wasm-pack picks up the locally built wasm-bindgen
ENV WASM_BINDGEN_PATH=/usr/local/cargo/bin/wasm-bindgen
