#!/bin/bash

# 智能体管理平台服务管理脚本
# 功能：启动、停止、重启服务，确保只有一个实例运行

set -e

# 配置变量
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="agent-platform"
PID_FILE="$PROJECT_DIR/.service.pid"
LOG_FILE="$PROJECT_DIR/service.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" | tee -a "$LOG_FILE"
}

# 检查是否在项目目录
check_project_dir() {
    if [[ ! -d "$PROJECT_DIR" ]]; then
        error "项目目录不存在: $PROJECT_DIR"
        exit 1
    fi
    
    if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
        error "项目目录中找不到 package.json 文件"
        exit 1
    fi
}

# 检查端口占用
check_port_usage() {
    local port=${1:-8787}
    local pid=$(lsof -ti:$port 2>/dev/null)
    
    if [[ -n "$pid" ]]; then
        warning "端口 $port 已被占用 (PID: $pid)"
        return 1
    fi
    return 0
}

# 查找并终止现有服务进程
kill_existing_processes() {
    log "检查并终止现有服务进程..."
    
    # 方法1: 通过PID文件查找
    if [[ -f "$PID_FILE" ]]; then
        local saved_pid=$(cat "$PID_FILE")
        if ps -p "$saved_pid" > /dev/null 2>&1; then
            log "终止PID文件记录的进程: $saved_pid"
            kill "$saved_pid" 2>/dev/null || true
            rm -f "$PID_FILE"
        fi
    fi
    
    # 方法2: 通过进程名查找
    local pids=$(pgrep -f "wrangler dev" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        log "终止 wrangler dev 进程: $pids"
        echo "$pids" | xargs kill 2>/dev/null || true
    fi
    
    # 方法3: 通过项目目录查找
    local project_pids=$(pgrep -f "$PROJECT_DIR" 2>/dev/null || true)
    if [[ -n "$project_pids" ]]; then
        log "终止项目相关进程: $project_pids"
        echo "$project_pids" | xargs kill 2>/dev/null || true
    fi
    
    # 等待进程完全终止
    sleep 2
    
    # 强制终止残留进程
    local remaining_pids=$(pgrep -f "wrangler dev|node.*worker" 2>/dev/null || true)
    if [[ -n "$remaining_pids" ]]; then
        log "强制终止残留进程: $remaining_pids"
        echo "$remaining_pids" | xargs kill -9 2>/dev/null || true
    fi
    
    success "现有服务进程已清理完毕"
}

# 检查依赖
check_dependencies() {
    log "检查项目依赖..."
    
    if ! command -v npm &> /dev/null; then
        error "未找到 npm 命令，请先安装 Node.js"
        exit 1
    fi
    
    if ! command -v wrangler &> /dev/null; then
        log "安装 wrangler..."
        npm install -g wrangler
    fi
    
    # 检查项目依赖
    if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
        log "安装项目依赖..."
        cd "$PROJECT_DIR"
        npm install
    fi
    
    success "依赖检查完成"
}

# 启动服务
start_service() {
    log "启动服务..."
    
    # 切换到项目目录
    cd "$PROJECT_DIR"
    
    # 清理现有进程
    kill_existing_processes
    
    # 检查端口
    local port=8787
    if ! check_port_usage "$port"; then
        # 尝试其他端口
        for port in {8788..8800}; do
            if check_port_usage "$port"; then
                break
            fi
        done
        
        if ! check_port_usage "$port"; then
            error "无法找到可用端口"
            exit 1
        fi
    fi
    
    # 启动服务
    log "在端口 $port 启动服务..."
    
    # 使用后台运行并重定向输出
    nohup npm run dev > "$LOG_FILE" 2>&1 &
    local service_pid=$!
    
    # 保存PID
    echo "$service_pid" > "$PID_FILE"
    
    # 等待服务启动
    local attempts=0
    local max_attempts=30
    
    log "等待服务启动..."
    while [[ $attempts -lt $max_attempts ]]; do
        if curl -s http://localhost:$port/health > /dev/null 2>&1; then
            success "服务启动成功！PID: $service_pid"
            success "访问地址: http://localhost:$port"
            return 0
        fi
        
        sleep 1
        attempts=$((attempts + 1))
        echo -n "."
    done
    
    error "服务启动超时"
    # 清理失败的进程
    kill "$service_pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
}

# 停止服务
stop_service() {
    log "停止服务..."
    
    local stopped=false
    
    # 通过PID文件停止
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            log "终止进程 PID: $pid"
            kill "$pid" 2>/dev/null || true
            
            # 等待进程终止
            local wait_count=0
            while [[ $wait_count -lt 10 ]] && ps -p "$pid" > /dev/null 2>&1; do
                sleep 1
                wait_count=$((wait_count + 1))
            done
            
            # 强制终止如果还存在
            if ps -p "$pid" > /dev/null 2>&1; then
                log "强制终止进程 PID: $pid"
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            rm -f "$PID_FILE"
            stopped=true
        else
            rm -f "$PID_FILE"  # 清理无效的PID文件
        fi
    fi
    
    # 清理所有相关进程
    kill_existing_processes
    
    if [[ "$stopped" == true ]]; then
        success "服务已停止"
    else
        warning "未找到运行中的服务"
    fi
}

# 重启服务
restart_service() {
    log "重启服务..."
    stop_service
    sleep 2
    start_service
}

# 查看服务状态
status_service() {
    log "检查服务状态..."
    
    local is_running=false
    
    # 检查PID文件
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            log "服务正在运行 (PID: $pid)"
            is_running=true
            
            # 检查端口
            local ports=$(lsof -p "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk '{print $9}' | cut -d':' -f2 | sort -u)
            if [[ -n "$ports" ]]; then
                log "监听端口: $ports"
            fi
        else
            warning "PID文件存在但进程已终止"
            rm -f "$PID_FILE"
        fi
    fi
    
    # 检查是否有相关进程在运行
    local running_pids=$(pgrep -f "wrangler dev|$PROJECT_DIR" 2>/dev/null || true)
    if [[ -n "$running_pids" ]] && [[ "$is_running" == false ]]; then
        warning "发现未记录的相关进程在运行: $running_pids"
        is_running=true
    fi
    
    if [[ "$is_running" == false ]]; then
        log "服务未运行"
    fi
}

# 查看日志
show_logs() {
    if [[ -f "$LOG_FILE" ]]; then
        log "显示最近的日志:"
        tail -n 20 "$LOG_FILE"
        echo ""
        echo "实时日志 (按 Ctrl+C 退出):"
        tail -f "$LOG_FILE"
    else
        warning "日志文件不存在: $LOG_FILE"
    fi
}

# 显示帮助
show_help() {
    echo "智能体管理平台服务管理脚本"
    echo ""
    echo "用法: $0 {start|stop|restart|status|logs|help}"
    echo ""
    echo "命令:"
    echo "  start    启动服务"
    echo "  stop     停止服务"
    echo "  restart  重启服务"
    echo "  status   查看服务状态"
    echo "  logs     查看服务日志"
    echo "  help     显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start     # 启动服务"
    echo "  $0 stop      # 停止服务"
    echo "  $0 restart   # 重启服务"
}

# 主函数
main() {
    # 检查参数
    if [[ $# -eq 0 ]]; then
        show_help
        exit 1
    fi
    
    # 检查项目目录
    check_project_dir
    
    case "$1" in
        start)
            check_dependencies
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            check_dependencies
            restart_service
            ;;
        status)
            status_service
            ;;
        logs)
            show_logs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"