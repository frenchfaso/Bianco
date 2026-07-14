FROM docker.io/library/node:24.18.0-alpine3.23 AS deps

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


FROM docker.io/library/caddy:2.11.4-alpine AS production

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80 443
