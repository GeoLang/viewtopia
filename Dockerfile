FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 5174;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://tiletopia:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /agent/ {
        proxy_pass http://geolang:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # vite emits module workers (pdfjs) as .mjs, which mime.types does not map,
    # and a module script served as octet-stream is refused by the browser
    location ~ \.mjs$ {
        types { text/javascript mjs; }
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
EXPOSE 5174
