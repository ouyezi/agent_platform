# 阿里云部署指南

## 概述

本文档介绍如何将智能体管理平台部署到阿里云ECS服务器。提供了三种部署方式：

1. **一键快速部署** - 最简单的方式，一行命令完成（强烈推荐）
2. **传统部署** - 直接在ECS上安装运行（适合需要自定义配置）
3. **Docker部署** - 使用容器化部署（推荐生产环境）

## 系统要求

- 阿里云ECS实例（推荐配置：2核4GB内存）
- Ubuntu 20.04 LTS 或 CentOS 8+
- 公网IP地址
- 安全组开放端口：22(SSH)、80(HTTP)、443(HTTPS)

## 方式一：一键快速部署（最推荐）

只需一行命令即可完成全部部署：

```bash
# SSH登录到你的服务器
ssh root@your-server-ip

# 运行一键部署命令
curl -fsSL https://raw.githubusercontent.com/ouyezi/agent_platform/main/agent-platform/quick-deploy.sh | sudo bash
```

部署完成后按照提示配置API密钥即可。

## 方式二：传统部署（手动方式）

### 1. 准备工作

```bash
# 登录到ECS实例
ssh root@your-server-ip
```

### 2. 克隆项目代码

```bash
# 克隆项目
git clone https://github.com/ouyezi/agent_platform.git
cd agent_platform/agent-platform
```

### 3. 运行部署脚本

```bash
# 给脚本添加执行权限
chmod +x deploy/aliyun-ecs-deploy.sh

# 运行部署脚本
./deploy/aliyun-ecs-deploy.sh
```

### 4. 配置API密钥

```bash
# 编辑环境变量文件
nano /opt/agent-platform/.env

# 设置你的千问API密钥
QWEN_API_KEY=sk-your-api-key-here

# 重启应用
supervisorctl restart agent-platform
```

### 5. 验证部署

```bash
# 检查应用状态
supervisorctl status agent-platform

# 测试健康检查
curl http://localhost/health

# 查看日志
tail -f /var/log/agent-platform/access.log
```

## 方式二：Docker部署（推荐生产环境）

### 1. 安装Docker和Docker Compose

```bash
# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 准备项目文件

将以下文件上传到服务器：
- `Dockerfile`
- `docker-compose.yml`
- `nginx.conf`
- `package.json`
- `src/` 目录
- `public/` 目录

### 3. 创建环境变量文件

```bash
# 创建.env文件
cat > .env << EOF
QWEN_API_KEY=sk-your-api-key-here
NODE_ENV=production
EOF
```

### 4. 启动服务

```bash
# 构建并启动容器
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

## 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| NODE_ENV | production | 运行环境 |
| PORT | 3000 | 应用端口 |
| QWEN_API_KEY |  | 千问API密钥（必填） |
| DEFAULT_MODEL | qwen-plus | 默认模型 |

## 管理命令

### 传统部署管理

```bash
# 查看应用状态
supervisorctl status agent-platform

# 重启应用
supervisorctl restart agent-platform

# 停止应用
supervisorctl stop agent-platform

# 启动应用
supervisorctl start agent-platform

# 查看日志
tail -f /var/log/agent-platform/access.log
tail -f /var/log/agent-platform/error.log
```

### Docker部署管理

```bash
# 查看服务状态
docker-compose ps

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f agent-platform
docker-compose logs -f nginx

# 进入容器
docker-compose exec agent-platform sh
```

## 安全配置建议

### 1. SSL证书配置

```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 2. 防火墙配置

```bash
# 启用ufw防火墙
sudo ufw enable

# 开放必要端口
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# 查看状态
sudo ufw status
```

### 3. 定期备份

```bash
# 创建备份脚本
cat > /opt/backup-agent-platform.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups"
APP_DIR="/opt/agent-platform"

mkdir -p $BACKUP_DIR

# 备份应用代码
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C $APP_DIR .

# 备份数据库
cp $APP_DIR/data/database.db $BACKUP_DIR/db_backup_$DATE.db

echo "Backup completed: $DATE"
EOF

chmod +x /opt/backup-agent-platform.sh

# 设置定时备份
crontab -e
# 添加: 0 2 * * * /opt/backup-agent-platform.sh
```

## 故障排除

### 常见问题

1. **应用无法启动**
   ```bash
   # 检查端口占用
   netstat -tlnp | grep 3000
   
   # 查看详细错误日志
   supervisorctl tail agent-platform stderr
   ```

2. **数据库连接问题**
   ```bash
   # 检查数据库文件权限
   ls -la /opt/agent-platform/data/
   
   # 修复权限
   chown -R www-data:www-data /opt/agent-platform/data/
   ```

3. **Nginx 502错误**
   ```bash
   # 检查应用是否运行
   supervisorctl status agent-platform
   
   # 检查Nginx配置
   nginx -t
   
   # 重启服务
   supervisorctl restart agent-platform
   systemctl restart nginx
   ```

4. **API调用失败**
   ```bash
   # 检查API密钥配置
   cat /opt/agent-platform/.env
   
   # 测试API连通性
   curl -X POST "http://localhost/api/config/status"
   ```

## 性能优化

### 1. Node.js性能调优

```bash
# 在环境变量中添加
export NODE_OPTIONS="--max-old-space-size=2048"
```

### 2. Nginx优化

```nginx
# 在nginx.conf中添加
worker_processes auto;
worker_connections 2048;
multi_accept on;

# 启用gzip压缩
gzip on;
gzip_vary on;
gzip_min_length 1024;
```

### 3. 数据库优化

```bash
# 定期清理旧数据
sqlite3 /opt/agent-platform/data/database.db "DELETE FROM executions WHERE timestamp < datetime('now', '-30 days');"
```

## 监控和日志

### 1. 系统监控

```bash
# 安装htop
sudo apt install htop

# 查看系统资源使用
htop
```

### 2. 应用监控

```bash
# 查看应用内存使用
ps aux | grep node

# 查看磁盘使用
df -h

# 查看网络连接
netstat -tlnp
```

## 升级部署

### 1. 传统部署升级

```bash
# 停止应用
supervisorctl stop agent-platform

# 备份当前版本
cp -r /opt/agent-platform /opt/agent-platform.backup.$(date +%Y%m%d)

# 更新代码
cd /opt/agent-platform
git pull  # 或上传新代码

# 安装新依赖
npm install --production

# 重启应用
supervisorctl start agent-platform
```

### 2. Docker部署升级

```bash
# 拉取最新代码
git pull

# 重建并重启容器
docker-compose down
docker-compose up -d --build

# 清理旧镜像
docker image prune -f
```

## 技术支持

如遇到问题，请提供以下信息以便快速定位：

1. 错误日志内容
2. 部署方式（传统/Docker）
3. 操作系统版本
4. Node.js版本
5. 具体的错误现象

---
**注意**：部署前请确保已准备好千问API密钥，可以从阿里云百炼平台获取。