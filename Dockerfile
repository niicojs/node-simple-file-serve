FROM node:alpine
WORKDIR app

COPY --from=ghcr.io/pnpm/pnpm:alpine /opt/pnpm /opt/pnpm
RUN for bin in pnpm pn pnpx pnx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

EXPOSE 8080

CMD [ "node", "server.js" ]
