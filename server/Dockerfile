FROM node:16

WORKDIR .

COPY package*.json ./

ENV NODE_OPTIONS="--max-old-space-size=10240"

RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "start"]