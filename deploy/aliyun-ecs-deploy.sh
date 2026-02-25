#!/bin/bash

# 阿里云ECS一键部署脚本
# 适用于Ubuntu/CentOS系统的ECS实例

set -e

# 配置变量
APP_NAME="agent-platform"
APP_PORT=3000
NODE_VERSION="18"
INSTALL_DIR="/opt/$APP_NAME"
LOG_DIR="/var/log/$APP_NAME"
USER="www-data"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "请使用root用户或sudo权限运行此脚本"
        exit 1
    fi
}

# 检测操作系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
    else
        error "无法识别操作系统"
        exit 1
    fi
    
    log "检测到操作系统: $OS $VER"
}

# 安装Node.js
install_nodejs() {
    log "正在安装Node.js $NODE_VERSION..."
    
    # 使用NodeSource仓库安装
    curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | sudo -E bash -
    apt-get install -y nodejs
    
    # 验证安装
    node_version=$(node --version)
    npm_version=$(npm --version)
    log "Node.js版本: $node_version"
    log "npm版本: $npm_version"
}

# 安装系统依赖
install_system_deps() {
    log "正在安装系统依赖..."
    
    apt-get update
    apt-get install -y \
        git \
        nginx \
        supervisor \
        build-essential \
        python3-dev \
        sqlite3
    
    log "系统依赖安装完成"
}

# 创建应用目录
setup_directories() {
    log "正在创建应用目录..."
    
    mkdir -p $INSTALL_DIR
    mkdir -p $LOG_DIR
    
    # 设置权限
    chown -R $USER:$USER $INSTALL_DIR
    chown -R $USER:$USER $LOG_DIR
}

# 部署应用代码
deploy_app() {
    log "正在部署应用代码..."
    
    cd $INSTALL_DIR
    
    # 如果是第一次部署，克隆代码
    if [ ! -d ".git" ]; then
        # 这里假设代码已经在本地，如果是远程仓库需要替换为git clone命令
        # git clone <your-repo-url> .
        cp -r /tmp/agent-platform/* . 2>/dev/null || true
        
        # 如果没有代码源，创建基本结构
        if [ ! -f "package.json" ]; then
            log "创建基础项目结构..."
            npm init -y
            npm install express cors sqlite3 sqlite uuid zod
        fi
    else
        # 更新代码
        git pull
    fi
    
    # 安装npm依赖
    npm install --production
    
    # 创建数据目录
    mkdir -p data
    chown $USER:$USER data
}

# 配置Nginx反向代理
configure_nginx() {
    log "正在配置Nginx..."
    
    cat > /etc/nginx/sites-available/$APP_NAME << EOF
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # 静态文件缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF

    # 启用站点
    ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
    
    # 测试配置
    nginx -t
    
    # 重启Nginx
    systemctl restart nginx
    systemctl enable nginx
    
    log "Nginx配置完成"
}

# 配置Supervisor进程管理
configure_supervisor() {
    log "正在配置Supervisor..."
    
    cat > /etc/supervisor/conf.d/$APP_NAME.conf << EOF
[program:$APP_NAME]
command=node src/server.js
directory=$INSTALL_DIR
user=$USER
autostart=true
autorestart=true
stderr_logfile=$LOG_DIR/error.log
stdout_logfile=$LOG_DIR/access.log
environment=NODE_ENV=production,PORT=$APP_PORT
EOF

    # 重新加载supervisor配置
    supervisorctl reread
    supervisorctl update
    
    log "Supervisor配置完成"
}

# 配置防火墙
configure_firewall() {
    log "正在配置防火墙..."
    
    # 开放必要端口
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    
    # 启用防火墙（如果尚未启用）
    if ! ufw status | grep -q "Status: active"; then
        echo "y" | ufw enable
    fi
    
    log "防火墙配置完成"
}

# 设置环境变量
setup_env_vars() {
    log "正在设置环境变量..."
    
    cat > $INSTALL_DIR/.env << EOF
NODE_ENV=production
PORT=$APP_PORT
QWEN_API_KEY=
DEFAULT_MODEL=qwen-plus
EOF

    chown $USER:$USER $INSTALL_DIR/.env
    log "环境变量配置完成，请手动设置QWEN_API_KEY"
}

# 启动应用
start_app() {
    log "正在启动应用..."
    
    supervisorctl start $APP_NAME
    
    # 等待应用启动
    sleep 5
    
    # 检查应用状态
    if supervisorctl status $APP_NAME | grep -q RUNNING; then
        log "应用启动成功！"
        log "访问地址: http://$(hostname -I | awk '{print $1}')"
        log "健康检查: http://$(hostname -I | awk '{print $1}')/health"
    else
        error "应用启动失败"
        supervisorctl status $APP_NAME
        exit 1
    fi
}

# 主函数
main() {
    log "开始部署智能体管理平台到阿里云ECS..."
    
    check_root
    detect_os
    install_system_deps
    install_nodejs
    setup_directories
    deploy_app
    configure_nginx
    configure_supervisor
    configure_firewall
    setup_env_vars
    start_app
    
    log "部署完成！🎉"
    log "请记得配置您的QWEN_API_KEY:"
    log "编辑文件: $INSTALL_DIR/.env"
    log "然后重启应用: supervisorctl restart $APP_NAME"
}

# 运行主函数
main "$@"