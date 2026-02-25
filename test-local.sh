#!/bin/bash

# 本地测试脚本
# 用于验证应用的所有功能

set -e

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

BASE_URL="http://localhost:3000"

# 测试健康检查
test_health_check() {
    log "测试健康检查接口..."
    response=$(curl -s -w "%{http_code}" $BASE_URL/health)
    http_code=${response: -3}
    
    if [ "$http_code" = "200" ]; then
        log "✓ 健康检查通过"
        echo "响应: ${response%???}"
    else
        error "✗ 健康检查失败 (HTTP $http_code)"
        return 1
    fi
}

# 测试创建智能体
test_create_agent() {
    log "测试创建智能体..."
    
    agent_data='{
        "name": "测试智能体",
        "description": "用于测试的智能体",
        "systemPrompt": "你是一个测试助手，请帮助用户进行各种测试。",
        "model": "qwen-plus",
        "temperature": 0.7,
        "maxTokens": 2048
    }'
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST $BASE_URL/api/agents \
        -H "Content-Type: application/json" \
        -d "$agent_data")
    
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ]; then
        log "✓ 智能体创建成功"
        echo "响应: $response_body"
        # 提取agentId用于后续测试
        AGENT_ID=$(echo "$response_body" | grep -o '"agentId":"[^"]*"' | cut -d'"' -f4)
        echo "Agent ID: $AGENT_ID"
    else
        error "✗ 智能体创建失败 (HTTP $http_code)"
        echo "响应: $response_body"
        return 1
    fi
}

# 测试获取智能体列表
test_get_agents() {
    log "测试获取智能体列表..."
    
    response=$(curl -s -w "\n%{http_code}" $BASE_URL/api/agents)
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ]; then
        log "✓ 获取智能体列表成功"
        echo "响应: $(echo "$response" | head -n -1)"
    else
        error "✗ 获取智能体列表失败 (HTTP $http_code)"
        return 1
    fi
}

# 测试激活智能体
test_activate_agent() {
    if [ -z "$AGENT_ID" ]; then
        warn "跳过激活测试：未找到Agent ID"
        return 0
    fi
    
    log "测试激活智能体..."
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST $BASE_URL/api/agents/$AGENT_ID/activate)
    
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ]; then
        log "✓ 智能体激活成功"
    else
        error "✗ 智能体激活失败 (HTTP $http_code)"
        return 1
    fi
}

# 测试获取系统信息
test_system_info() {
    log "测试获取系统信息..."
    
    # 测试健康检查
    curl -s $BASE_URL/health | jq '.' 2>/dev/null || echo "健康检查响应: $(curl -s $BASE_URL/health)"
    
    # 测试配置状态
    curl -s $BASE_URL/api/config/status | jq '.' 2>/dev/null || echo "配置状态响应: $(curl -s $BASE_URL/api/config/status)"
    
    # 测试模型信息
    curl -s $BASE_URL/api/models | jq '.' 2>/dev/null || echo "模型信息响应: $(curl -s $BASE_URL/api/models)"
}

# 测试静态文件服务
test_static_files() {
    log "测试静态文件服务..."
    
    response=$(curl -s -w "%{http_code}" $BASE_URL/)
    http_code=${response: -3}
    
    if [ "$http_code" = "200" ]; then
        log "✓ 静态文件服务正常"
    else
        error "✗ 静态文件服务异常 (HTTP $http_code)"
        return 1
    fi
}

# 主测试函数
main() {
    log "开始测试智能体管理平台..."
    
    # 检查服务是否运行
    if ! curl -s $BASE_URL/health >/dev/null 2>&1; then
        error "服务未运行，请先启动服务: npm run dev"
        exit 1
    fi
    
    # 运行各项测试
    test_health_check
    test_static_files
    test_create_agent
    test_get_agents
    test_activate_agent
    test_system_info
    
    log "所有测试完成！🎉"
}

# 运行测试
main "$@"