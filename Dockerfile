## Multi-stage build for production React app, OpenShift friendly
## Builder stage
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --silent

# Copy source and build
COPY . .
RUN npm run build


## Production stage: use nginx and listen on 8080 so OpenShift can map routes
FROM nginx:stable-alpine

# Clear default content
RUN rm -rf /usr/share/nginx/html/*

# Copy built app
COPY --from=builder /app/build /usr/share/nginx/html

# Copy a custom nginx config that listens on 8080 and supports SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Ensure files are readable by an arbitrary UID (OpenShift runs containers as random UIDs)
RUN chmod -R 755 /usr/share/nginx/html

EXPOSE 8080

STOPSIGNAL SIGTERM
CMD ["nginx", "-g", "daemon off;"]
