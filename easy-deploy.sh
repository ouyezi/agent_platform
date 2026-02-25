#!/bin/bash

# 简易部署脚本 - 适用于Gitee仓库
# 使用方法: 请从Gitee仓库直接下载此脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为root用户
if [[ $EUID -ne 0 ]]; then
    error "请使用root用户或sudo权限运行此脚本"
    echo "使用方法: 请从Gitee仓库直接下载此脚本并运行"
    exit 1
fi

log "开始简易部署智能体管理平台..."

# 更新系统包
log "更新系统包..."
apt-get update -y

# 安装必要的工具
log "安装Git和curl..."
apt-get install -y git curl

# 创建部署目录
DEPLOY_DIR="/opt/agent-platform-deploy"
log "创建工作目录: $DEPLOY_DIR"
mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

# 克隆项目
log "克隆Gitee项目..."
git clone https://gitee.com/todni/agent_platform.git
cd agent_platform/agent-platform

# 检查关键文件是否存在
if [[ ! -f "deploy/aliyun-ecs-deploy.sh" ]]; then
    error "部署脚本不存在，请检查Gitee仓库"
    exit 1
fi

# 运行正式部署脚本
log "运行部署脚本..."
chmod +x deploy/aliyun-ecs-deploy.sh
./deploy/aliyun-ecs-deploy.sh

log "🎉 部署完成！"
log ""
log "下一步操作："
log "1. 配置API密钥："
log "   nano /opt/agent-platform/.env"
log "   设置: QWEN_API_KEY=sk-your-api-key-here"
log ""
log "2. 重启服务："
log "   supervisorctl restart agent-platform"
log ""
log "3. 访问应用："
log "   http://$(hostname -I | awk '{print $1}')"
log ""
log "4. 查看状态："
log "   supervisorctl status agent-platform"

# 清理临时文件
cd /
rm -rf $DEPLOY_DIR

exit 0