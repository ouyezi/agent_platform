# 智能体管理平台

一个基于通义千问的智能体管理平台，支持一键部署到阿里云ECS服务器。从Gitee快速克隆即可开始使用。

## 🚀 特性

- **一键部署**：从Gitee克隆后可快速部署到服务器
- **专为千问优化**：深度集成通义千问API
- **轻量级架构**：Node.js + Express + SQLite，易于维护
- **实时监控**：内置API调用统计和成本监控
- **响应式界面**：现代化的Web管理界面
- **多种部署方式**：支持传统部署和Docker部署

## 🏗️ 技术栈

- **前端**：原生HTML/CSS/JavaScript
- **后端**：Node.js + Express
- **数据库**：SQLite
- **部署**：支持传统部署和Docker容器化
- **AI模型**：通义千问系列

## 📁 项目结构

```
agent-platform/
├── src/
│   ├── server.js             # 主服务文件
│   ├── services/
│   │   ├── qwenService.js    # 千问API集成
│   │   └── databaseService.js # 数据库操作
│   ├── utils/
│   │   └── monitoring.js     # 监控和日志
│   └── types/
│       └── index.d.ts        # 类型定义
├── public/
│   └── index.html            # 管理界面
├── deploy/
│   └── aliyun-ecs-deploy.sh  # 一键部署脚本
├── service.sh                # 本地服务管理脚本
├── Dockerfile                # Docker配置
├── docker-compose.yml        # Docker Compose配置
├── nginx.conf                # Nginx配置
└── package.json              # 项目配置
```

## 🚀 快速开始

### 1. 服务器部署（推荐方式）

```bash
# SSH登录到你的服务器
ssh root@your-server-ip

# 克隆项目
git clone https://gitee.com/todni/agent_platform.git
cd agent_platform/agent-platform

# 运行一键部署脚本
chmod +x deploy/aliyun-ecs-deploy.sh
deploy/aliyun-ecs-deploy.sh

# 配置API密钥
nano /opt/agent-platform/.env
# 设置: QWEN_API_KEY=sk-your-api-key-here

# 重启服务
supervisorctl restart agent-platform
```

### 2. 一行命令快速部署（备用方案）

如果上面的方式不可用，可以使用这个方法：

```bash
# SSH登录到你的服务器
ssh root@your-server-ip

# 下载并运行部署脚本
# 注意：Gitee暂不支持raw.githubusercontent.com格式的直接下载
chmod +x aliyun-ecs-deploy.sh
./aliyun-ecs-deploy.sh
```

### 2. 本地开发

```bash
# 克隆项目
git clone https://gitee.com/todni/agent_platform.git
cd agent_platform/agent-platform

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 或使用服务脚本
./service.sh start

# 访问 http://localhost:3000
```

### 3. Docker部署

```bash
# 克隆项目
git clone https://gitee.com/todni/agent_platform.git
cd agent_platform/agent-platform

# 创建环境变量文件
echo "QWEN_API_KEY=sk-your-api-key-here" > .env

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## 🔧 API接口

### 智能体管理
- `GET /api/agents` - 获取所有智能体
- `POST /api/agents` - 创建新智能体
- `GET /api/agents/:id` - 获取智能体详情
- `PUT /api/agents/:id` - 更新智能体
- `DELETE /api/agents/:id` - 删除智能体

### 智能体执行
- `POST /api/agents/:id/execute` - 执行智能体

### 系统接口
- `GET /health` - 健康检查
- `GET /api/models` - 支持的模型列表
- `GET /api/metrics` - 系统指标
- `POST /api/metrics/reset` - 重置指标

### 配置管理
- `GET /api/config/status` - 获取配置状态
- `POST /api/config/test` - 测试API连接

## 📊 监控功能

平台内置以下监控指标：
- API调用次数
- 总成本统计
- 平均响应时间
- 成功率统计
- 系统资源使用情况

通过 `/api/metrics` 接口可以获取实时监控数据。

### 服务管理

```bash
# 查看服务状态
supervisorctl status agent-platform
# 或使用服务脚本
./service.sh status

# 重启服务
supervisorctl restart agent-platform
# 或使用服务脚本
./service.sh restart

# 查看日志
tail -f /var/log/agent-platform/access.log
# 或使用服务脚本
./service.sh logs
```

## 🔒 安全说明

- API密钥应通过环境变量配置，不要硬编码
- 生产环境建议配置SSL证书
- 建议配置防火墙规则，只开放必要端口
- 定期备份数据库文件
- 敏感操作应添加身份验证（可选）

## 📈 成本控制

千问模型定价参考：
- qwen-turbo: ¥0.0008/千token
- qwen-plus: ¥0.004/千token  
- qwen-max: ¥0.02/千token

平台会自动计算每次调用的成本并在监控中显示。

### 资源优化建议

- 生产环境建议使用2核4GB配置
- 定期清理历史执行记录
- 启用Nginx缓存减少重复请求
- 监控API调用频率避免超额使用

## 🤝 贡献指南

欢迎提交Issue和Pull Request来改进项目！

### 本地开发流程

1. Fork项目到你的Gitee账户
2. 克隆到本地进行开发
3. 提交PR到主仓库

```bash
git clone https://gitee.com/your-username/agent_platform.git
cd agent_platform/agent-platform
npm install
npm run dev
```

## 📄 许可证

MIT License

## 🙏 致谢

- [通义千问](https://dashscope.aliyun.com/)
- [Express.js](https://expressjs.com/)
- [SQLite](https://www.sqlite.org/)

## 📚 文档

- [部署指南](DEPLOYMENT.md) - 详细的服务器部署说明
- [服务管理](SERVICE_MANAGEMENT.md) - 服务启停和监控说明