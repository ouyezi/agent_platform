# 使用说明

## 🚀 服务器快速部署

### 一行命令部署（推荐）

```bash
# SSH登录到你的阿里云ECS服务器
ssh root@your-server-ip

# 运行一键部署脚本
curl -fsSL https://raw.githubusercontent.com/ouyezi/agent_platform/main/agent-platform/quick-deploy.sh | sudo bash
```

部署完成后，按照提示进行配置：

1. **配置API密钥**
   ```bash
   nano /opt/agent-platform/.env
   # 设置: QWEN_API_KEY=sk-your-api-key-here
   ```

2. **重启服务**
   ```bash
   supervisorctl restart agent-platform
   ```

3. **访问应用**
   - 浏览器访问: `http://你的服务器IP`
   - 健康检查: `curl http://你的服务器IP/health`

## 💻 本地开发

### 克隆项目
```bash
git clone https://gitee.com/todni/agent_platform.git
cd agent_platform/agent-platform
```

### 安装依赖
```bash
npm install
```

### 启动开发服务
```bash
# 方法1: 使用npm
npm run dev

# 方法2: 使用服务脚本（推荐）
./service.sh start
```

访问地址: `http://localhost:3000`

### 服务管理命令
```bash
./service.sh start    # 启动服务
./service.sh stop     # 停止服务
./service.sh restart  # 重启服务
./service.sh status   # 查看状态
./service.sh logs     # 查看日志
```

## 🐳 Docker部署

### 准备环境变量
```bash
echo "QWEN_API_KEY=sk-your-api-key-here" > .env
```

### 启动服务
```bash
docker-compose up -d
```

### 管理命令
```bash
# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down
```

## ⚙️ 配置说明

### 环境变量配置
在 `.env` 文件中配置以下参数：

```bash
# 必需配置
QWEN_API_KEY=sk-your-api-key-here    # 千问API密钥

# 可选配置
NODE_ENV=production                   # 运行环境
PORT=3000                            # 应用端口
DEFAULT_MODEL=qwen-plus              # 默认模型
```

### 获取千问API密钥
1. 访问 [阿里云百炼平台](https://dashscope.aliyun.com/)
2. 注册并登录账号
3. 创建API密钥
4. 复制密钥到配置文件

## 🔧 常用管理命令

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
```

## 📊 监控和调试

### 健康检查
```bash
curl http://localhost:3000/health
```

### 查看系统指标
```bash
curl http://localhost:3000/api/metrics
```

### 测试API连接
```bash
curl -X POST http://localhost:3000/api/config/test
```

## 🔒 安全建议

1. **生产环境配置SSL证书**
   ```bash
   # 安装certbot
   sudo apt install certbot python3-certbot-nginx
   
   # 获取证书
   sudo certbot --nginx -d your-domain.com
   ```

2. **配置防火墙**
   ```bash
   # 启用ufw防火墙
   sudo ufw enable
   
   # 开放必要端口
   sudo ufw allow ssh
   sudo ufw allow http
   sudo ufw allow https
   ```

3. **定期备份**
   ```bash
   # 备份应用和数据
   tar -czf backup_$(date +%Y%m%d).tar.gz /opt/agent-platform
   ```

## ❓ 常见问题

### 服务无法启动
```bash
# 检查端口占用
netstat -tlnp | grep 3000

# 查看详细错误日志
supervisorctl tail agent-platform stderr
```

### API调用失败
```bash
# 检查API密钥配置
cat /opt/agent-platform/.env

# 测试API连通性
curl -X POST "http://localhost:3000/api/config/status"
```

### 数据库问题
```bash
# 检查数据库文件权限
ls -la /opt/agent-platform/data/

# 修复权限
chown -R www-data:www-data /opt/agent-platform/data/
```

更多详细信息请查看 [部署指南](DEPLOYMENT.md) 和 [服务管理](SERVICE_MANAGEMENT.md) 文档。