FROM docker.io/library/node:24.22.1-alpine3.23 AS deps

RUN apk upgrade --no-cache \
    && apk add --no-cache 'ca-certificates>=20261020-r0' \
    && update-ca-certificates

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


FROM deps AS development

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


FROM deps AS build

COPY . .

RUN npm run build


# This verified builder digest contains Go 1.27.3. The upstream runtime tag
# downloads an older prebuilt binary, so rebuild Caddy with the patched toolchain.
FROM docker.io/library/caddy:2.11.7-builder-alpine@sha256:ef9b65adf9a224770c6d5f6d1ae1bf99bc3caaa78d8c4bae3ea949ee6984f301 AS caddy-build

RUN apk upgrade --no-cache \
    && apk add --no-cache 'ca-certificates>=20261020-r0' \
    && update-ca-certificates \
    && go version \
    && CGO_ENABLED=0 xcaddy build v2.11.7 --output /usr/bin/caddy


# The official runtime currently bundles vulnerable curl/libcurl 8.22.0.
# Caddy is pure Go and does not need either; keep the application runtime minimal.
FROM docker.io/library/alpine:3.24 AS production

RUN apk upgrade --no-cache \
    && apk add --no-cache 'ca-certificates>=20261020-r0' libcap mailcap \
    && update-ca-certificates \
    && mkdir -p /config/caddy /data/caddy /etc/caddy /srv \
    && chmod 1777 /config/caddy /data/caddy

ENV XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/data

COPY --from=caddy-build /usr/bin/caddy /usr/bin/caddy
RUN setcap cap_net_bind_service=+ep /usr/bin/caddy

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

LABEL org.opencontainers.image.version=v2.11.7 \
      org.opencontainers.image.licenses=Apache-2.0 \
      org.opencontainers.image.source=https://github.com/caddyserver/caddy

WORKDIR /srv
EXPOSE 80 443 443/udp
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
