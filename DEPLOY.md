# 智能体管理平台部署指南

## 概述

本文档详细介绍如何将智能体管理平台部署到阿里云ECS服务器。提供了多种部署方式以适应不同需求。

## 系统要求

### 基础环境要求
- **操作系统**: Ubuntu 20.04 LTS 或 CentOS 8+
- **CPU**: 2核或以上
- **内存**: 4GB或以上
- **存储**: 20GB可用空间
- **网络**: 公网IP地址，安全组开放端口：22(SSH)、80(HTTP)、443(HTTPS)

### Node.js版本要求
- **最低版本**: Node.js 18.x LTS
- **推荐版本**: Node.js 20.x LTS
- **为什么需要较新版本**: 
  - 支持ES模块(`"type": "module"`)
  - 更好的性能和安全性
  - 兼容项目依赖包的最新特性

## 部署方式

### 方式一：标准Git克隆部署（推荐）

这是最稳定可靠的部署方式：

```bash
# 1. SSH登录到服务器
ssh root@your-server-ip

# 2. 更新系统包
apt update && apt upgrade -y

# 3. 安装Node.js 20.x LTS（推荐）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# 验证Node.js版本
node --version  # 应该显示 v20.x.x
npm --version   # 应该显示 9.x.x 或更高

# 4. 克隆项目
git clone https://gitee.com/todni/agent_platform.git
cd agent_platform/agent-platform

# 5. 运行部署脚本
chmod +x deploy/aliyun-ecs-deploy.sh
./deploy/aliyun-ecs-deploy.sh

# 6. 配置API密钥
nano /opt/agent-platform/.env
# 添加: QWEN_API_KEY=sk-your-api-key-here

# 7. 重启服务
supervisorctl restart agent-platform
```

### 方式二：Docker容器化部署（生产环境推荐）

```bash
# 1. SSH登录到服务器
ssh root@your-server-ip

# 2. 安装Docker和Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. 克隆项目
git clone https://gitee.com/todni/agent_platform.git
cd agent_platform/agent-platform

# 4. 创建环境变量文件
cat > .env << EOF
QWEN_API_KEY=sk-your-api-key-here
NODE_ENV=production
PORT=3000
DEFAULT_MODEL=qwen-plus
EOF

# 5. 启动服务
docker-compose up -d --build

# 6. 查看服务状态
docker-compose ps
docker-compose logs -f
```

### 方式三：手动部署（适合自定义配置）

```bash
# 1. SSH登录到服务器
ssh root@your-server-ip

# 2. 安装系统依赖
apt update
apt install -y git nginx supervisor build-essential python3-dev sqlite3

# 3. 安装Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# 4. 创建应用目录
mkdir -p /opt/agent-platform
cd /opt/agent-platform

# 5. 克隆项目代码
git clone https://github.com/ouyezi/agent_platform.git temp_clone
mv temp_clone/agent-platform/* .
mv temp_clone/agent-platform/.[^.]* . 2>/dev/null || true
rm -rf temp_clone

# 6. 安装依赖
npm install --production

# 7. 创建数据目录
mkdir -p data
chown www-data:www-data data

# 8. 配置环境变量
cat > .env << EOF
NODE_ENV=production
PORT=3000
QWEN_API_KEY=sk-your-api-key-here
DEFAULT_MODEL=qwen-plus
EOF
chown www-data:www-data .env

# 9. 配置Supervisor
cat > /etc/supervisor/conf.d/agent-platform.conf << EOF
[program:agent-platform]
command=node src/server.js
directory=/opt/agent-platform
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/log/agent-platform/error.log
stdout_logfile=/var/log/agent-platform/access.log
environment=NODE_ENV=production,PORT=3000
EOF

# 10. 配置Nginx
cat > /etc/nginx/sites-available/agent-platform << EOF
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF

ln -sf /etc/nginx/sites-available/agent-platform /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

# 11. 启动服务
supervisorctl reread
supervisorctl update
supervisorctl start agent-platform
```

## 环境变量配置

### 必需配置
| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| QWEN_API_KEY | 千问API密钥（必需） | sk-your-api-key-here |

### 可选配置
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| NODE_ENV | production | 运行环境 |
| PORT | 3000 | 应用端口 |
| DEFAULT_MODEL | qwen-plus | 默认模型 |
| LOG_LEVEL | info | 日志级别 |

## 服务管理命令

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

## 验证部署

部署完成后，通过以下方式验证：

```bash
# 检查服务状态
supervisorctl status agent-platform
# 或Docker方式
docker-compose ps

# 健康检查
curl http://localhost/health
curl http://your-server-ip/health

# 测试API连接
curl -X POST http://localhost/api/config/test

# 查看应用日志
tail -f /var/log/agent-platform/access.log
# 或Docker方式
docker-compose logs -f agent-platform
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

## 性能优化

### 1. Node.js性能调优
```bash
# 在环境变量中添加
export NODE_OPTIONS="--max-old-space-size=2048"

# 或在.service文件中配置
Environment=NODE_OPTIONS=--max-old-space-size=2048
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
VACUUM;
```

## 故障排除

### 常见问题及解决方案

1. **Node.js版本问题**
   ```bash
   # 检查Node.js版本
   node --version
   
   # 如果版本过低，重新安装
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   apt-get install -y nodejs
   ```

2. **应用无法启动**
   ```bash
   # 检查端口占用
   netstat -tlnp | grep 3000
   
   # 查看详细错误日志
   supervisorctl tail agent-platform stderr
   
   # 检查依赖安装
   cd /opt/agent-platform
   npm install --production
   ```

3. **数据库连接问题**
   ```bash
   # 检查数据库文件权限
   ls -la /opt/agent-platform/data/
   
   # 修复权限
   chown -R www-data:www-data /opt/agent-platform/data/
   chmod 755 /opt/agent-platform/data/
   ```

4. **Nginx 502错误**
   ```bash
   # 检查应用是否运行
   supervisorctl status agent-platform
   
   # 检查Nginx配置
   nginx -t
   
   # 重启服务
   supervisorctl restart agent-platform
   systemctl restart nginx
   ```

5. **API调用失败**
   ```bash
   # 检查API密钥配置
   cat /opt/agent-platform/.env
   
   # 测试API连通性
   curl -X POST "http://localhost/api/config/status"
   
   # 检查网络连接
   ping dashscope.aliyun.com
   ```

## 升级部署

### 传统部署升级
```bash
# 停止应用
supervisorctl stop agent-platform

# 备份当前版本
cp -r /opt/agent-platform /opt/agent-platform.backup.$(date +%Y%m%d)

# 更新代码
cd /opt/agent-platform
git pull

# 安装新依赖
npm install --production

# 重启应用
supervisorctl start agent-platform
```

### Docker部署升级
```bash
# 拉取最新代码
cd /path/to/agent_platform/agent-platform
git pull

# 重建并重启容器
docker-compose down
docker-compose up -d --build

# 清理旧镜像
docker image prune -f
```

## 监控和日志

### 系统监控
```bash
# 安装htop
sudo apt install htop

# 查看系统资源使用
htop

# 查看磁盘使用
df -h

# 查看内存使用
free -h
```

### 应用监控
```bash
# 查看应用进程
ps aux | grep node

# 查看网络连接
netstat -tlnp

# 实时查看日志
tail -f /var/log/agent-platform/access.log
```

## 技术支持

如遇到问题，请提供以下信息以便快速定位：

1. 操作系统版本和架构
2. Node.js和npm版本
3. 错误日志内容
4. 部署方式（传统/Docker）
5. 具体的错误现象和复现步骤

---

**注意**: 
- 部署前请确保已准备好千问API密钥，可以从[阿里云百炼平台](https://dashscope.aliyun.com/)获取
- 生产环境强烈推荐使用Docker部署方式
- 定期备份数据和配置文件
- 及时更新安全补丁和依赖包