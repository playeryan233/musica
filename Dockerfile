# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# 用 lockfile 精确安装；public/font 与 public/soundfont 由 alphaTab 的 Vite
# 插件在构建期从 node_modules 拷贝，所以这里不能省掉 npm ci。
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 部署在域名根目录时保持默认；子路径部署传 --build-arg DEPLOY_BASE=/musica/
ARG DEPLOY_BASE=/
ENV DEPLOY_BASE=${DEPLOY_BASE}
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
