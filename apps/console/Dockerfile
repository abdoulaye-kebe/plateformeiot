FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_PLATFORM_API_URL=http://localhost:8081
ARG NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8082
ARG NEXT_PUBLIC_CHIRPSTACK_URL=http://localhost:8080
ENV NEXT_PUBLIC_PLATFORM_API_URL=$NEXT_PUBLIC_PLATFORM_API_URL
ENV NEXT_PUBLIC_KEYCLOAK_URL=$NEXT_PUBLIC_KEYCLOAK_URL
ENV NEXT_PUBLIC_CHIRPSTACK_URL=$NEXT_PUBLIC_CHIRPSTACK_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
