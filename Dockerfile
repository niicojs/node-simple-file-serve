FROM node:12
WORKDIR app

COPY package*.json ./
USER node
RUN npm install --production
COPY --chown=node:node . ./

EXPOSE 8080

CMD [ "node", "server.js" ]
