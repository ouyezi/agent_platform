# 服务管理脚本使用说明

## 概述
本项目提供了两套服务管理脚本，用于方便地启动、停止和管理智能体管理平台服务。

## 脚本说明

### 1. `dev.sh` - 开发环境脚本（推荐）
适用于日常开发使用，功能简洁高效。

### 2. `service.sh` - 生产环境脚本
功能更完整，包含更多检查和日志功能。

## 使用方法

### 基本命令

```bash
# 启动服务
./dev.sh start              # 前台启动（调试用）
./dev.sh start --background # 后台启动（推荐）

# 停止服务
./dev.sh stop

# 重启服务
./dev.sh restart            # 前台重启
./dev.sh restart --background # 后台重启

# 查看状态
./dev.sh status

# 查看日志
./dev.sh logs               # 查看最近日志
./dev.sh logs -f            # 实时查看日志
```

## 核心特性

### ✅ 唯一实例保证
- 启动前自动检测并终止已有进程
- 确保同一时间只有一个服务实例运行
- 避免端口冲突和资源浪费

### ✅ 智能进程管理
- 通过PID文件跟踪进程
- 多重进程检测机制
- 优雅终止和强制清理

### ✅ 端口检测
- 自动检测端口占用情况
- 智能选择可用端口
- 实时显示服务访问地址

### ✅ 日志管理
- 自动记录服务日志
- 支持实时日志查看
- 便于问题排查和调试

## 使用示例

### 日常开发流程
```bash
# 1. 启动服务进行开发
cd agent-platform
./dev.sh start --background

# 2. 查看服务状态
./dev.sh status

# 3. 开发过程中查看实时日志
./dev.sh logs -f

# 4. 完成开发后停止服务
./dev.sh stop
```

### 问题排查
```bash
# 查看详细状态
./dev.sh status

# 查看完整日志
./dev.sh logs

# 重启服务
./dev.sh restart --background
```

## 注意事项

1. **权限要求**：首次使用需要执行 `chmod +x *.sh` 添加执行权限
2. **依赖检查**：脚本会自动检查Node.js和npm环境
3. **项目目录**：确保在项目根目录下执行脚本
4. **端口占用**：如果8787端口被占用，服务会自动选择其他可用端口

## 故障排除

### 常见问题

**Q: 脚本提示权限不足**
A: 执行 `chmod +x dev.sh service.sh` 添加执行权限

**Q: 服务启动失败**
A: 检查日志文件 `dev.log` 查看详细错误信息

**Q: 端口被占用**
A: 脚本会自动选择其他端口，或手动停止占用端口的进程

**Q: 服务无法停止**
A: 使用 `./dev.sh stop` 命令，或手动执行 `pkill -f wrangler`

## 高级用法

### 自定义配置
可以在脚本中修改以下配置：
```bash
PROJECT_DIR="/path/to/your/project"  # 项目路径
PID_FILE=".custom.pid"               # PID文件名
LOG_FILE="custom.log"                # 日志文件名
```

### 集成到开发流程
可以将常用命令添加到shell配置文件中：
```bash
# ~/.bashrc 或 ~/.zshrc
alias agent-start='cd /path/to/agent-platform && ./dev.sh start --background'
alias agent-stop='cd /path/to/agent-platform && ./dev.sh stop'
alias agent-status='cd /path/to/agent-platform && ./dev.sh status'
```

这样就可以直接使用 `agent-start`、`agent-stop` 等命令。