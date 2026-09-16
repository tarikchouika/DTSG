FROM node:22-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--experimental-sqlite", "server.js"]
