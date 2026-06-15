# Architecture-agnostic at build time (COPY only, no RUN), so
# `docker build --platform <p>` is cheap and all emulation happens at
# `docker run`. BASE selects glibc (bookworm-slim) vs musl (alpine).
ARG BASE=node:22-bookworm-slim
FROM ${BASE}
WORKDIR /e2e
COPY package.tgz smoke.cjs entrypoint.sh /e2e/
ENTRYPOINT ["sh", "/e2e/entrypoint.sh"]
