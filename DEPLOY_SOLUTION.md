# 部署解决方案说明

## 问题说明

由于GitHub raw.githubusercontent.com的缓存机制，新提交的文件可能需要一些时间才能通过raw链接访问到。

## 推荐的部署方式

### 方式一：标准Git克隆部署（推荐）

这是最稳定可靠的部署方式：

```bash
# 1. SSH登录到服务器
ssh root@your-server-ip

# 2. 克隆项目
git clone https://github.com/ouyezi/agent_platform.git
cd agent_platform/agent-platform

# 3. 运行部署脚本
chmod +x deploy/aliyun-ecs-deploy.sh
./deploy/aliyun-ecs-deploy.sh

# 4. 配置API密钥
nano /opt/agent-platform/.env
# 添加: QWEN_API_KEY=sk-your-api-key-here

# 5. 重启服务
supervisorctl restart agent-platform
```

### 方式二：手动下载部署脚本

如果不想克隆整个项目，可以单独下载部署脚本：

```bash
# 1. SSH登录到服务器
ssh root@your-server-ip

# 2. 创建工作目录
mkdir -p /tmp/agent-deploy
cd /tmp/agent-deploy

# 3. 下载部署脚本
wget https://raw.githubusercontent.com/ouyezi/agent_platform/main/agent-platform/deploy/aliyun-ecs-deploy.sh
# 或者使用curl
# curl -O https://raw.githubusercontent.com/ouyezi/agent_platform/main/agent-platform/deploy/aliyun-ecs-deploy.sh

chmod +x aliyun-ecs-deploy.sh

# 4. 下载项目代码
git clone https://github.com/ouyezi/agent_platform.git
cd agent_platform/agent-platform

# 5. 运行部署
../aliyun-ecs-deploy.sh

# 6. 配置和启动（同方式一）
```

### 方式三：Docker部署

对于熟悉Docker的用户：

```bash
# 1. SSH登录到服务器
ssh root@your-server-ip

# 2. 安装Docker（如果未安装）
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 3. 克隆项目
git clone https://github.com/ouyezi/agent_platform.git
cd agent_platform/agent-platform

# 4. 创建环境变量文件
echo "QWEN_API_KEY=sk-your-api-key-here" > .env

# 5. 启动服务
docker-compose up -d

# 6. 查看状态
docker-compose ps
```

## 验证部署

部署完成后，可以通过以下方式验证：

```bash
# 检查服务状态
supervisorctl status agent-platform

# 健康检查
curl http://localhost/health

# 查看日志
tail -f /var/log/agent-platform/access.log
```

## 常见问题解决

### 1. 404错误
如果遇到raw.githubusercontent.com的404错误，请使用方式一的标准Git克隆方法。

### 2. 权限问题
确保以root用户或使用sudo权限运行部署脚本。

### 3. 端口占用
```bash
# 检查端口占用
netstat -tlnp | grep 3000

# 如果端口被占用，可以修改部署脚本中的端口配置
```

### 4. API密钥配置
```bash
# 编辑配置文件
nano /opt/agent-platform/.env

# 测试API连接
curl -X POST http://localhost/api/config/test
```

## 后续维护

### 更新部署
```bash
# 进入项目目录
cd /opt/agent-platform

# 拉取最新代码
git pull

# 重启服务
supervisorctl restart agent-platform
```

### 备份数据
```bash
# 备份数据库
cp /opt/agent-platform/data/database.db /backup/database_$(date +%Y%m%d).db

# 备份配置
cp /opt/agent-platform/.env /backup/env_$(date +%Y%m%d).backup
```

## 技术支持

如遇到问题，请提供以下信息：
1. 操作系统版本
2. 错误日志内容
3. 部署方式
4. 具体的错误现象

可以通过GitHub Issues或邮件联系项目维护者。