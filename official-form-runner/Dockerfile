FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER pwuser
CMD ["npm", "start"]
