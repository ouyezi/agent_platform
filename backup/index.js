import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { QwenService } from './services/qwenService.js';
import { DatabaseService } from './services/databaseService.js';
import { Logger, metricsCollector } from './utils/monitoring.js';

const app = new Hono();

// 数据库初始化中间件
app.use('*', async (c, next) => {
  try {
    const dbService = new DatabaseService(c.env.DB);
    await dbService.initializeTables();
    await next();
  } catch (error) {
    console.error('数据库初始化失败:', error);
    await next();
  }
});

// 静态文件服务
app.get('/', async (c) => {
  const html = await loadStaticFile('index.html');
  return c.html(html);
});

app.get('/static/*', async (c) => {
  const path = c.req.path.replace('/static/', '');
  return c.html(await loadStaticFile(path));
});

// 健康检查
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development',
    qwenApiKeyConfigured: !!c.env.QWEN_API_KEY
  });
});

// 智能体管理API
app.get('/api/agents', async (c) => {
  try {
    const db = new DatabaseService(c.env.DB);
    const agents = await db.getAllAgents();
    return c.json(agents);
  } catch (error) {
    console.error('获取智能体列表失败:', error);
    return c.json({ error: '获取智能体列表失败' }, 500);
  }
});

app.post('/api/agents', async (c) => {
  try {
    const agentData = await c.req.json();
    const db = new DatabaseService(c.env.DB);
    
    if (!agentData.name || !agentData.systemPrompt) {
      return c.json({ error: '缺少必要字段: name, systemPrompt' }, 400);
    }

    const agentId = await db.createAgent({
      name: agentData.name,
      description: agentData.description,
      model: agentData.model || c.env.DEFAULT_MODEL || 'qwen-plus',
      systemPrompt: agentData.systemPrompt,
      temperature: agentData.temperature || 0.7,
      maxTokens: agentData.maxTokens || 2048,
      tools: agentData.tools || [],
      status: 'inactive'
    });

    return c.json({ 
      success: true, 
      agentId,
      message: '智能体创建成功'
    });
  } catch (error) {
    console.error('创建智能体失败:', error);
    return c.json({ error: '创建智能体失败' }, 500);
  }
});

app.get('/api/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id');
    const db = new DatabaseService(c.env.DB);
    const agent = await db.getAgent(agentId);
    
    if (!agent) {
      return c.json({ error: '智能体不存在' }, 404);
    }
    
    return c.json(agent);
  } catch (error) {
    console.error('获取智能体详情失败:', error);
    return c.json({ error: '获取智能体详情失败' }, 500);
  }
});

app.put('/api/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id');
    const updates = await c.req.json();
    const db = new DatabaseService(c.env.DB);
    
    const success = await db.updateAgent(agentId, updates);
    
    if (!success) {
      return c.json({ error: '更新智能体失败' }, 500);
    }
    
    return c.json({ success: true, message: '智能体更新成功' });
  } catch (error) {
    console.error('更新智能体失败:', error);
    return c.json({ error: '更新智能体失败' }, 500);
  }
});

app.delete('/api/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id');
    const db = new DatabaseService(c.env.DB);
    
    const success = await db.deleteAgent(agentId);
    
    if (!success) {
      return c.json({ error: '删除智能体失败' }, 500);
    }
    
    return c.json({ success: true, message: '智能体删除成功' });
  } catch (error) {
    console.error('删除智能体失败:', error);
    return c.json({ error: '删除智能体失败' }, 500);
  }
});

// 激活智能体
app.post('/api/agents/:id/activate', async (c) => {
  try {
    const agentId = c.req.param('id');
    const db = new DatabaseService(c.env.DB);
    
    const success = await db.updateAgent(agentId, { status: 'active' });
    
    if (!success) {
      return c.json({ error: '激活智能体失败' }, 500);
    }
    
    return c.json({ success: true, message: '智能体已激活' });
  } catch (error) {
    console.error('激活智能体失败:', error);
    return c.json({ error: '激活智能体失败' }, 500);
  }
});

// 停用智能体
app.post('/api/agents/:id/deactivate', async (c) => {
  try {
    const agentId = c.req.param('id');
    const db = new DatabaseService(c.env.DB);
    
    const success = await db.updateAgent(agentId, { status: 'inactive' });
    
    if (!success) {
      return c.json({ error: '停用智能体失败' }, 500);
    }
    
    return c.json({ success: true, message: '智能体已停用' });
  } catch (error) {
    console.error('停用智能体失败:', error);
    return c.json({ error: '停用智能体失败' }, 500);
  }
});

// 智能体执行API
app.post('/api/agents/:id/execute', async (c) => {
  try {
    const agentId = c.req.param('id');
    const { input, stream = false } = await c.req.json();
    
    if (!input) {
      return c.json({ error: '缺少输入内容' }, 400);
    }

    const db = new DatabaseService(c.env.DB);
    const agent = await db.getAgent(agentId);
    
    if (!agent) {
      return c.json({ error: '智能体不存在' }, 404);
    }

    if (agent.status !== 'active') {
      return c.json({ error: '智能体未激活' }, 400);
    }

    // 创建执行记录
    const executionId = await db.createExecution({
      agentId,
      input,
      output: '',
      status: 'running',
      cost: 0,
      duration: 0
    });

    // 调用千问API
    const startTime = Date.now();
    const qwen = new QwenService(c.env.QWEN_API_KEY);
    
    const messages = [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: input }
    ];

    const response = await qwen.chat(messages, agent.model, {
      temperature: agent.temperature,
      maxTokens: agent.maxTokens
    });

    const duration = Date.now() - startTime;
    const cost = QwenService.estimateCost(agent.model, response.usage?.total_tokens || 0);

    // 处理千问API响应格式
    const outputText = response.output?.text || response.choices?.[0]?.message?.content || '无响应内容';

    // 记录监控指标
    metricsCollector.recordAPICall(duration, cost, true);

    // 更新执行记录
    await db.updateExecution(executionId, {
      output: outputText,
      status: 'success',
      cost,
      duration
    });

    return c.json({
      executionId,
      agentId,
      input,
      output: outputText,
      cost,
      duration,
      model: agent.model,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('执行智能体失败:', error);
    return c.json({ error: '执行智能体失败: ' + error.message }, 500);
  }
});

// 执行记录API
app.get('/api/executions', async (c) => {
  try {
    const agentId = c.req.query('agentId');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const db = new DatabaseService(c.env.DB);
    const executions = await db.getExecutions(agentId, limit);
    
    return c.json(executions);
  } catch (error) {
    console.error('获取执行记录失败:', error);
    return c.json({ error: '获取执行记录失败' }, 500);
  }
});

// API密钥配置API
app.post('/api/config/qwen-key', async (c) => {
  try {
    const { apiKey } = await c.req.json();
    
    if (!apiKey) {
      return c.json({ error: 'API密钥不能为空' }, 400);
    }

    if (!apiKey.startsWith('sk-')) {
      return c.json({ error: '无效的API密钥格式' }, 400);
    }

    return c.json({ 
      success: true, 
      message: 'API密钥配置成功',
      maskedKey: apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4)
    });
  } catch (error) {
    console.error('配置API密钥失败:', error);
    return c.json({ error: '配置API密钥失败' }, 500);
  }
});

// 获取配置状态
app.get('/api/config/status', (c) => {
  return c.json({
    qwenApiKeyConfigured: !!c.env.QWEN_API_KEY,
    qwenApiKeyHint: c.env.QWEN_API_KEY ? 
      c.env.QWEN_API_KEY.substring(0, 8) + '...' + c.env.QWEN_API_KEY.substring(c.env.QWEN_API_KEY.length - 4) :
      null
  });
});

// 模型信息API
app.get('/api/models', (c) => {
  return c.json(QwenService.getSupportedModels());
});

// 监控API
app.get('/api/metrics', (c) => {
  return c.json(metricsCollector.getMetrics());
});

app.post('/api/metrics/reset', (c) => {
  metricsCollector.reset();
  return c.json({ success: true, message: '指标已重置' });
});

// 错误处理中间件
app.onError((err, c) => {
  console.error('应用错误:', err);
  return c.json({ 
    error: '内部服务器错误',
    message: err.message 
  }, 500);
});

// 静态文件加载辅助函数
async function loadStaticFile(filename) {
  try {
    if (filename === 'index.html') {
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>智能体管理平台</title>
    <style>
        :root {
            --primary-color: #3b82f6;
            --secondary-color: #64748b;
            --success-color: #10b981;
            --warning-color: #f59e0b;
            --danger-color: #ef4444;
            --background-color: #f8fafc;
            --card-background: #ffffff;
            --border-color: #e2e8f0;
            --text-primary: #1e293b;
            --text-secondary: #64748b;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--background-color);
            color: var(--text-primary);
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        /* 导航栏样式 */
        .navbar {
            background: white;
            padding: 1rem 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
        }

        .nav-container {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .nav-brand {
            font-size: 1.5rem;
            font-weight: bold;
            color: var(--primary-color);
            text-decoration: none;
        }

        .nav-links {
            display: flex;
            gap: 2rem;
        }

        .nav-link {
            text-decoration: none;
            color: var(--text-secondary);
            font-weight: 500;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            transition: all 0.2s;
        }

        .nav-link:hover, .nav-link.active {
            color: var(--primary-color);
            background-color: rgba(59, 130, 246, 0.1);
        }

        /* 页面容器 */
        .page {
            display: none;
        }

        .page.active {
            display: block;
        }

        /* 卡片样式 */
        .card {
            background: var(--card-background);
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            border: 1px solid var(--border-color);
            margin-bottom: 1.5rem;
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--border-color);
        }

        .card-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--text-primary);
        }

        /* 按钮样式 */
        .btn {
            padding: 0.5rem 1rem;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }

        .btn-primary {
            background-color: var(--primary-color);
            color: white;
        }

        .btn-primary:hover {
            background-color: #2563eb;
            transform: translateY(-1px);
        }

        .btn-success {
            background-color: var(--success-color);
            color: white;
        }

        .btn-warning {
            background-color: var(--warning-color);
            color: white;
        }

        .btn-danger {
            background-color: var(--danger-color);
            color: white;
        }

        /* 表单样式 */
        .form-group {
            margin-bottom: 1rem;
        }

        .form-label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
            color: var(--text-primary);
        }

        .form-input, .form-textarea, .form-select {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 1rem;
            transition: border-color 0.2s;
        }

        .form-input:focus, .form-textarea:focus, .form-select:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-textarea {
            min-height: 120px;
            resize: vertical;
        }

        /* 智能体网格 */
        .agents-grid {
            display: grid;
            gap: 1rem;
            margin-top: 1rem;
        }

        .agent-card {
            background: var(--card-background);
            border-radius: 8px;
            padding: 1rem;
            border: 1px solid var(--border-color);
            transition: all 0.2s;
        }

        .agent-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .agent-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
        }

        .agent-name {
            font-weight: 600;
            font-size: 1.1rem;
        }

        .agent-status {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.875rem;
            font-weight: 500;
        }

        .status-active {
            background-color: rgba(16, 185, 129, 0.1);
            color: var(--success-color);
        }

        .status-inactive {
            background-color: rgba(100, 116, 139, 0.1);
            color: var(--secondary-color);
        }

        .agent-description {
            color: var(--text-secondary);
            margin-bottom: 0.75rem;
            font-size: 0.9rem;
        }

        .agent-model {
            display: inline-block;
            background-color: rgba(59, 130, 246, 0.1);
            color: var(--primary-color);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            margin-right: 0.5rem;
        }

        /* 通知样式 */
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1001;
            transform: translateX(120%);
            transition: transform 0.3s;
        }

        .notification.show {
            transform: translateX(0);
        }

        .notification.success {
            background-color: var(--success-color);
        }

        .notification.error {
            background-color: var(--danger-color);
        }

        /* 聊天对话框样式 */
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1000;
        }

        .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
        }

        .modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            max-width: 800px;
            width: 90%;
            max-height: 80vh;
            overflow: hidden;
        }

        .chat-modal {
            height: 80vh;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border-color);
            background-color: var(--card-background);
        }

        .modal-header h3 {
            margin: 0;
            color: var(--text-primary);
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: var(--text-secondary);
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.2s;
        }

        .modal-close:hover {
            background-color: var(--border-color);
        }

        .modal-body {
            padding: 0;
            height: calc(80vh - 60px);
        }

        .chat-container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
            background-color: #f8fafc;
        }

        .chat-message {
            margin-bottom: 1rem;
            display: flex;
            flex-direction: column;
        }

        .chat-message.user {
            align-items: flex-end;
        }

        .chat-message.system, .chat-message.assistant {
            align-items: flex-start;
        }

        .message-content {
            max-width: 80%;
            padding: 0.75rem 1rem;
            border-radius: 18px;
            line-height: 1.5;
            word-wrap: break-word;
        }

        .chat-message.user .message-content {
            background-color: var(--primary-color);
            color: white;
            border-bottom-right-radius: 4px;
        }

        .chat-message.system .message-content {
            background-color: #e2e8f0;
            color: var(--text-secondary);
            border-bottom-left-radius: 4px;
        }

        .chat-message.assistant .message-content {
            background-color: white;
            border: 1px solid var(--border-color);
            border-bottom-left-radius: 4px;
        }

        .message-time {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-top: 0.25rem;
            padding: 0 0.5rem;
        }

        .chat-input-area {
            border-top: 1px solid var(--border-color);
            padding: 1rem;
            background-color: white;
        }

        .input-container {
            display: flex;
            gap: 0.5rem;
            align-items: flex-end;
        }

        #chat-input {
            flex: 1;
            padding: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: 20px;
            resize: none;
            font-family: inherit;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.2s;
        }

        #chat-input:focus {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .send-button {
            background-color: var(--primary-color);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 0.75rem 1.5rem;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.2s;
            height: fit-content;
        }

        .send-button:hover:not(:disabled) {
            background-color: #2563eb;
        }

        .send-button:disabled {
            background-color: var(--border-color);
            cursor: not-allowed;
        }

        .chat-status {
            margin-top: 0.5rem;
            font-size: 0.875rem;
            color: var(--text-secondary);
            text-align: center;
        }

        /* 滚动条样式 */
        .chat-messages::-webkit-scrollbar {
            width: 6px;
        }

        .chat-messages::-webkit-scrollbar-track {
            background: transparent;
        }

        .chat-messages::-webkit-scrollbar-thumb {
            background-color: var(--border-color);
            border-radius: 3px;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            .nav-container {
                flex-direction: column;
                gap: 1rem;
            }
            
            .nav-links {
                gap: 1rem;
            }
            
            .container {
                padding: 15px;
            }
            
            .agents-grid {
                grid-template-columns: 1fr;
            }
            
            .modal-content {
                width: 95%;
                height: 90vh;
            }
            
            .chat-modal {
                height: 90vh;
            }
            
            .modal-body {
                height: calc(90vh - 60px);
            }
            
            .message-content {
                max-width: 90%;
            }
        }
    </style>
</head>
<body>
    <!-- 导航栏 -->
    <nav class="navbar">
        <div class="nav-container">
            <a href="#" class="nav-brand" onclick="navigateTo('agents')">🤖 智能体管理</a>
            <div class="nav-links">
                <a href="#" class="nav-link active" data-page="agents" onclick="navigateTo('agents')">智能体列表</a>
                <a href="#" class="nav-link" data-page="new-agent" onclick="navigateTo('new-agent')">新建智能体</a>
                <a href="#" class="nav-link" data-page="settings" onclick="navigateTo('settings')">系统设置</a>
            </div>
        </div>
    </nav>

    <div class="container">
        <!-- 智能体列表页面 -->
        <div id="agents-page" class="page active">
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">智能体列表</h2>
                    <button class="btn btn-primary" onclick="loadAgents()">
                        刷新列表
                    </button>
                </div>
                <div class="agents-grid" id="agents-list">
                    <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                        加载中...
                    </div>
                </div>
            </div>
        </div>

        <!-- 新建/编辑智能体页面 -->
        <div id="new-agent-page" class="page">
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title" id="agent-form-title">创建新智能体</h2>
                    <button class="btn btn-primary" onclick="navigateTo('agents')">返回列表</button>
                </div>
                <form id="agent-form">
                    <input type="hidden" id="agent-id">
                    <div class="form-group">
                        <label class="form-label">智能体名称 *</label>
                        <input type="text" class="form-input" id="agent-name" required placeholder="请输入智能体名称">
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <textarea class="form-textarea" id="agent-description" placeholder="简要描述智能体的功能"></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">系统提示词 *</label>
                        <textarea class="form-textarea" id="agent-prompt" required placeholder="为智能体设置角色和行为准则"></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">选择模型</label>
                        <select class="form-select" id="agent-model">
                            <option value="qwen-plus">通义千问 Plus（推荐）</option>
                            <option value="qwen-turbo">通义千问 Turbo</option>
                            <option value="qwen-max">通义千问 Max</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">温度系数 (0-1)</label>
                        <input type="number" class="form-input" id="agent-temperature" min="0" max="1" step="0.1" value="0.7">
                    </div>
                    <div class="form-group">
                        <label class="form-label">最大Token数</label>
                        <input type="number" class="form-input" id="agent-max-tokens" min="1" max="32768" value="2048">
                    </div>
                    <button type="submit" class="btn btn-primary">
                        <span class="btn-text">创建智能体</span>
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="resetAgentForm()" style="margin-left: 1rem;">
                        重置表单
                    </button>
                </form>
            </div>
        </div>

        <!-- 系统设置页面 -->
        <div id="settings-page" class="page">
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">API密钥配置</h2>
                </div>
                <div id="api-config-status">
                    <p>检查API密钥配置状态...</p>
                </div>
                <form id="api-key-form" style="display: none;">
                    <div class="form-group">
                        <label class="form-label">千问API密钥 *</label>
                        <input type="password" class="form-input" id="qwen-api-key" required placeholder="请输入您的通义千问API密钥 (sk-...)">
                        <small style="color: var(--text-secondary);">从阿里云百炼平台获取API密钥</small>
                    </div>
                    <button type="submit" class="btn btn-primary">保存配置</button>
                </form>
                <button class="btn btn-primary" onclick="checkApiConfig()" id="check-config-btn">检查配置</button>
            </div>

            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">系统信息</h2>
                </div>
                <div id="system-info">
                    <p>加载中...</p>
                </div>
            </div>
        </div>
    </div>

    <!-- 聊天对话框模态框 -->
    <div class="modal" id="chat-modal" style="display: none;">
        <div class="modal-overlay" onclick="closeChatModal()"></div>
        <div class="modal-content chat-modal">
            <div class="modal-header">
                <h3 id="chat-agent-name">智能体对话</h3>
                <button class="modal-close" onclick="closeChatModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="chat-container">
                    <div class="chat-messages" id="chat-messages">
                        <div class="chat-message system">
                            <div class="message-content">
                                欢迎使用智能体对话！请输入您的问题开始对话。
                            </div>
                            <div class="message-time">${new Date().toLocaleTimeString()}</div>
                        </div>
                    </div>
                    <div class="chat-input-area">
                        <div class="input-container">
                            <textarea 
                                id="chat-input" 
                                placeholder="输入消息..." 
                                rows="3"
                                onkeydown="handleChatInput(event)"
                            ></textarea>
                            <button class="send-button" onclick="sendMessage()">
                                发送
                            </button>
                        </div>
                        <div class="chat-status" id="chat-status">
                            准备就绪
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 通知框 -->
    <div class="notification" id="notification"></div>

    <script>
        // 全局变量
        const API_BASE = '';
        let currentPage = 'agents';
        let editingAgentId = null;

        // 页面导航
        function navigateTo(page) {
            // 隐藏所有页面
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            
            // 显示目标页面
            document.getElementById(\`\${page}-page\`).classList.add('active');
            document.querySelector(\`[data-page="\${page}"]\`).classList.add('active');
            
            currentPage = page;
            
            // 根据页面执行相应操作
            switch(page) {
                case 'agents':
                    loadAgents();
                    break;
                case 'new-agent':
                    resetAgentForm();
                    break;
                case 'settings':
                    checkApiConfig();
                    loadSystemInfo();
                    break;
            }
        }

        // 通知系统
        function showNotification(message, type = 'success') {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = \`notification \${type} show\`;
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }

        // API调用辅助函数
        async function apiCall(url, options = {}) {
            try {
                const response = await fetch(API_BASE + url, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    ...options
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || '请求失败');
                }
                
                return data;
            } catch (error) {
                console.error('API调用错误:', error);
                throw error;
            }
        }

        // 智能体相关功能
        async function loadAgents() {
            try {
                const agents = await apiCall('/api/agents');
                const container = document.getElementById('agents-list');
                
                if (agents.length === 0) {
                    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">暂无智能体，请先创建一个</div>';
                    return;
                }
                
                container.innerHTML = agents.map(agent => \`
                    <div class="agent-card">
                        <div class="agent-header">
                            <div class="agent-name">\${agent.name}</div>
                            <span class="agent-status \${agent.status === 'active' ? 'status-active' : 'status-inactive'}">
                                \${agent.status === 'active' ? '运行中' : '已停止'}
                            </span>
                        </div>
                        <div class="agent-description">\${agent.description || '暂无描述'}</div>
                        <div>
                            <span class="agent-model">\${getModelDisplayName(agent.model)}</span>
                            <button class="btn btn-success" style="padding: 0.25rem 0.75rem; font-size: 0.875rem;" 
                                    onclick="openChatDialog('\${agent.id}', '\${agent.name}')" \${agent.status !== 'active' ? 'disabled' : ''}>
                                测试
                            </button>
                            <button class="btn" style="padding: 0.25rem 0.75rem; font-size: 0.875rem; background: \${agent.status === 'active' ? '#f59e0b' : '#10b981'}; color: white;" 
                                    onclick="\${agent.status === 'active' ? \`deactivateAgent('\${agent.id}')\` : \`activateAgent('\${agent.id}')\`}">
                                \${agent.status === 'active' ? '停用' : '激活'}
                            </button>
                            <button class="btn" style="padding: 0.25rem 0.75rem; font-size: 0.875rem; background: #8b5cf6; color: white;" 
                                    onclick="editAgent('\${agent.id}')">
                                编辑
                            </button>
                            <button class="btn btn-danger" style="padding: 0.25rem 0.75rem; font-size: 0.875rem;" 
                                    onclick="deleteAgent('\${agent.id}')">
                                删除
                            </button>
                        </div>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('加载智能体失败:', error);
                showNotification('加载智能体列表失败: ' + error.message, 'error');
            }
        }

        async function createAgent(agentData) {
            try {
                const result = await apiCall('/api/agents', {
                    method: 'POST',
                    body: JSON.stringify(agentData)
                });
                
                showNotification('智能体创建成功！');
                navigateTo('agents');
                return result.agentId;
            } catch (error) {
                showNotification('创建智能体失败: ' + error.message, 'error');
                throw error;
            }
        }

        async function updateAgent(agentId, agentData) {
            try {
                await apiCall(\`/api/agents/\${agentId}\`, {
                    method: 'PUT',
                    body: JSON.stringify(agentData)
                });
                
                showNotification('智能体更新成功！');
                navigateTo('agents');
            } catch (error) {
                showNotification('更新智能体失败: ' + error.message, 'error');
                throw error;
            }
        }

        async function deleteAgent(agentId) {
            if (!confirm('确定要删除这个智能体吗？')) return;
            
            try {
                await apiCall(\`/api/agents/\${agentId}\`, {
                    method: 'DELETE'
                });
                
                showNotification('智能体删除成功！');
                loadAgents();
            } catch (error) {
                showNotification('删除智能体失败: ' + error.message, 'error');
            }
        }

        async function activateAgent(agentId) {
            try {
                await apiCall(\`/api/agents/\${agentId}/activate\`, {
                    method: 'POST'
                });
                
                showNotification('智能体已激活！');
                loadAgents();
            } catch (error) {
                showNotification('激活智能体失败: ' + error.message, 'error');
            }
        }

        async function deactivateAgent(agentId) {
            if (!confirm('确定要停用这个智能体吗？')) return;
            
            try {
                await apiCall(\`/api/agents/\${agentId}/deactivate\`, {
                    method: 'POST'
                });
                
                showNotification('智能体已停用！');
                loadAgents();
            } catch (error) {
                showNotification('停用智能体失败: ' + error.message, 'error');
            }
        }

        async function executeAgent(agentId) {
            const input = prompt('请输入测试内容:');
            if (!input) return;
            
            try {
                const result = await apiCall(\`/api/agents/\${agentId}/execute\`, {
                    method: 'POST',
                    body: JSON.stringify({ input })
                });
                
                alert('智能体回复:\\n\\n' + result.output);
            } catch (error) {
                showNotification('执行智能体失败: ' + error.message, 'error');
            }
        }

        // 智能体表单功能
        function editAgent(agentId) {
            editingAgentId = agentId;
            document.getElementById('agent-form-title').textContent = '编辑智能体';
            navigateTo('new-agent');
        }

        function resetAgentForm() {
            document.getElementById('agent-form').reset();
            document.getElementById('agent-id').value = '';
            document.getElementById('agent-form-title').textContent = '创建新智能体';
            editingAgentId = null;
        }

        // 配置相关功能
        async function checkApiConfig() {
            try {
                const config = await apiCall('/api/config/status');
                const statusDiv = document.getElementById('api-config-status');
                const form = document.getElementById('api-key-form');
                const checkBtn = document.getElementById('check-config-btn');
                
                if (config.qwenApiKeyConfigured) {
                    statusDiv.innerHTML = \`
                        <p style="color: green;">✅ API密钥已配置</p>
                        <p>密钥: \${config.qwenApiKeyHint}</p>
                    \`;
                    form.style.display = 'none';
                    checkBtn.textContent = '重新配置';
                    checkBtn.onclick = () => {
                        form.style.display = 'block';
                        checkBtn.textContent = '检查配置';
                        checkBtn.onclick = checkApiConfig;
                    };
                } else {
                    statusDiv.innerHTML = \`
                        <p style="color: red;">❌ 未配置API密钥</p>
                        <p>请配置千问API密钥以启用智能体执行功能</p>
                    \`;
                    form.style.display = 'block';
                }
            } catch (error) {
                console.error('检查配置失败:', error);
                document.getElementById('api-config-status').innerHTML = 
                    '<p style="color: red;">检查配置失败，请稍后重试</p>';
            }
        }

        async function saveApiKey(e) {
            e.preventDefault();
            
            const apiKey = document.getElementById('qwen-api-key').value;
            
            if (!apiKey) {
                showNotification('请输入API密钥', 'error');
                return;
            }
            
            try {
                await apiCall('/api/config/qwen-key', {
                    method: 'POST',
                    body: JSON.stringify({ apiKey })
                });
                
                showNotification('API密钥配置成功！');
                document.getElementById('api-key-form').reset();
                checkApiConfig();
            } catch (error) {
                showNotification('配置失败: ' + error.message, 'error');
            }
        }

        // 系统信息
        async function loadSystemInfo() {
            try {
                const [health, metrics, models] = await Promise.all([
                    apiCall('/health'),
                    apiCall('/api/metrics'),
                    apiCall('/api/models')
                ]);
                
                document.getElementById('system-info').innerHTML = \`
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <div>
                            <strong>系统状态:</strong> 
                            <span style="color: \${health.status === 'ok' ? 'green' : 'red'}">
                                \${health.status === 'ok' ? '✅ 正常' : '❌ 异常'}
                            </span>
                        </div>
                        <div><strong>API调用次数:</strong> \${metrics.apiCalls}</div>
                        <div><strong>总成本:</strong> ¥\${metrics.totalCost.toFixed(6)}</div>
                        <div><strong>成功率:</strong> \${metrics.successRate}</div>
                        <div><strong>支持模型:</strong> \${models.length}种</div>
                    </div>
                \`;
            } catch (error) {
                document.getElementById('system-info').innerHTML = 
                    '<p style="color: red;">加载系统信息失败</p>';
            }
        }

        // 辅助函数
        function getModelDisplayName(model) {
            const names = {
                'qwen-turbo': 'Turbo',
                'qwen-plus': 'Plus',
                'qwen-max': 'Max'
            };
            return names[model] || model;
        }

        // 聊天对话框相关函数
        let currentChatAgentId = null;
        let chatHistory = [];

        function openChatDialog(agentId, agentName) {
            currentChatAgentId = agentId;
            document.getElementById('chat-agent-name').textContent = agentName + ' - 对话测试';
            document.getElementById('chat-modal').style.display = 'block';
            document.getElementById('chat-input').focus();
            
            // 清空历史记录
            chatHistory = [];
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.innerHTML = 
                '<div class="chat-message system">' +
                '<div class="message-content">' +
                '欢迎与 ' + agentName + ' 对话！请输入您的问题开始对话。' +
                '</div>' +
                '<div class="message-time">' + new Date().toLocaleTimeString() + '</div>' +
                '</div>';
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function closeChatModal() {
            document.getElementById('chat-modal').style.display = 'none';
            currentChatAgentId = null;
            document.getElementById('chat-input').value = '';
        }

        function addMessage(role, content) {
            const messagesContainer = document.getElementById('chat-messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message ' + role;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;
            
            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = new Date().toLocaleTimeString();
            
            messageDiv.appendChild(contentDiv);
            messageDiv.appendChild(timeDiv);
            messagesContainer.appendChild(messageDiv);
            
            // 滚动到底部
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        async function sendMessage() {
            const inputElement = document.getElementById('chat-input');
            const message = inputElement.value.trim();
            
            if (!message || !currentChatAgentId) return;
            
            // 添加用户消息
            addMessage('user', message);
            
            // 清空输入框
            inputElement.value = '';
            
            // 更新状态
            const statusElement = document.getElementById('chat-status');
            statusElement.textContent = 'AI正在思考...';
            document.querySelector('.send-button').disabled = true;
            
            try {
                // 调用API
                const result = await apiCall('/api/agents/' + currentChatAgentId + '/execute', {
                    method: 'POST',
                    body: JSON.stringify({ input: message })
                });
                
                // 添加AI回复
                addMessage('assistant', result.output);
                statusElement.textContent = '准备就绪';
                
                // 记录到历史
                chatHistory.push(
                    { role: 'user', content: message },
                    { role: 'assistant', content: result.output }
                );
                
            } catch (error) {
                addMessage('system', '错误: ' + error.message);
                statusElement.textContent = '发送失败';
                showNotification('发送消息失败: ' + error.message, 'error');
            } finally {
                document.querySelector('.send-button').disabled = false;
                inputElement.focus();
            }
        }

        function handleChatInput(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        // 事件监听器
        document.addEventListener('DOMContentLoaded', function() {
            // 表单提交事件
            document.getElementById('agent-form').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const agentData = {
                    name: document.getElementById('agent-name').value,
                    description: document.getElementById('agent-description').value,
                    systemPrompt: document.getElementById('agent-prompt').value,
                    model: document.getElementById('agent-model').value,
                    temperature: parseFloat(document.getElementById('agent-temperature').value),
                    maxTokens: parseInt(document.getElementById('agent-max-tokens').value),
                    tools: []
                };
                
                try {
                    if (editingAgentId) {
                        await updateAgent(editingAgentId, agentData);
                    } else {
                        await createAgent(agentData);
                    }
                } catch (error) {
                    // 错误已在各自的函数中处理
                }
            });
            
            document.getElementById('api-key-form').addEventListener('submit', saveApiKey);
            
            // 初始化
            loadAgents();
        });
    </script>
</body>
</html>`;
    }
    return '<h1>文件未找到</h1>';
  } catch (error) {
    console.error('加载静态文件失败:', error);
    return '<h1>服务器错误</h1>';
  }
}

export default app;