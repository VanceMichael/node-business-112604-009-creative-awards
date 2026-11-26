FROM node:22.23.4-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /home/node/state && chown node:node /home/node/state
USER node
ENV PEER_HOST=0.0.0.0
ENV PEER_STATE=/tmp/peer/state.json
EXPOSE 4300
CMD ["npm", "run", "peer"]
