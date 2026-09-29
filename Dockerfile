FROM node:22-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /app/data
ENV NODE_ENV=production
# [v2.67·H1+] طاقم خيوط libuv أوسع: scrypt الدخول وبث الملفات يتشاركان الطاقم
ENV UV_THREADPOOL_SIZE=8
EXPOSE 3000
CMD ["node", "--experimental-sqlite", "server.js"]
