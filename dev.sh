#!/bin/bash

# 开发环境服务管理脚本
# 简化版本，专注于快速启动和停止

set -e

# 配置
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$PROJECT_DIR/.dev.pid"
LOG_FILE="$PROJECT_DIR/dev.log"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 日志函数
log() { echo -e "${BLUE}[DEV] $1${NC}"; }
success() { echo -e "${GREEN}[SUCCESS] $1${NC}"; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }
error() { echo -e "${RED}[ERROR] $1${NC}"; }

# 杀死现有进程
kill_existing() {
    log "清理现有进程..."
    
    # 通过PID文件
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
    
    # 通过进程名
    pkill -f "wrangler dev" 2>/dev/null || true
    pkill -f "node.*worker" 2>/dev/null || true
    
    sleep 1
}

# 启动服务
start() {
    log "启动开发服务..."
    
    # 清理现有进程
    kill_existing
    
    # 切换目录
    cd "$PROJECT_DIR"
    
    # 启动服务
    if [[ "$1" == "--background" ]]; then
        # 后台运行
        nohup npm run dev > "$LOG_FILE" 2>&1 &
        local pid=$!
        echo "$pid" > "$PID_FILE"
        
        # 等待启动
        sleep 3
        if kill -0 "$pid" 2>/dev/null; then
            success "服务已在后台启动 (PID: $pid)"
            success "日志文件: $LOG_FILE"
        else
            error "服务启动失败"
            exit 1
        fi
    else
        # 前台运行
        npm run dev
    fi
}

# 停止服务
stop() {
    log "停止服务..."
    kill_existing
    success "服务已停止"
}

# 重启服务
restart() {
    stop
    sleep 1
    start "$1"
}

# 查看状态
status() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            success "服务正在运行 (PID: $pid)"
            
            # 显示端口信息
            local port=$(lsof -p "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk '{print $9}' | head -1 | cut -d':' -f2)
            if [[ -n "$port" ]]; then
                success "监听端口: $port"
                success "访问地址: http://localhost:$port"
            fi
        else
            warning "PID文件存在但进程已终止"
            rm -f "$PID_FILE"
        fi
    else
        log "服务未运行"
    fi
}

# 查看日志
logs() {
    if [[ -f "$LOG_FILE" ]]; then
        if [[ "$1" == "--follow" ]] || [[ "$1" == "-f" ]]; then
            tail -f "$LOG_FILE"
        else
            tail -n 20 "$LOG_FILE"
        fi
    else
        warning "日志文件不存在"
    fi
}

# 主菜单
case "${1:-help}" in
    start)
        start "$2"
        ;;
    stop)
        stop
        ;;
    restart)
        restart "$2"
        ;;
    status)
        status
        ;;
    logs)
        logs "$2"
        ;;
    *)
        echo "开发服务管理脚本"
        echo "用法: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "start [--background]  启动服务 (可选后台运行)"
        echo "stop                 停止服务"
        echo "restart [--background] 重启服务"
        echo "status               查看状态"
        echo "logs [-f]            查看日志 (-f 实时查看)"
        echo ""
        echo "示例:"
        echo "  $0 start              # 前台启动"
        echo "  $0 start --background # 后台启动"
        echo "  $0 logs -f            # 实时查看日志"
        ;;
esac