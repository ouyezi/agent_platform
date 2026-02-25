import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { QwenService } from './services/qwenService.js';
import { DatabaseService } from './services/databaseService.js';
import { Logger, metricsCollector } from './utils/monitoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '../public')));

// 配置环境变量
const config = {
  QWEN_API_KEY: process.env.QWEN_API_KEY || '',
  DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'qwen-plus',
  ENVIRONMENT: process.env.NODE_ENV || 'development'
};

// 数据库初始化中间件
app.use(async (req, res, next) => {
  try {
    const dbPath = join(__dirname, '../data/database.db');
    const dbService = new DatabaseService(dbPath);
    await dbService.initializeTables();
    req.db = dbService;
    next();
  } catch (error) {
    console.error('数据库初始化失败:', error);
    next();
  }
});

// 静态文件服务
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.ENVIRONMENT,
    qwenApiKeyConfigured: !!config.QWEN_API_KEY,
    port: PORT
  });
});

// 智能体管理API
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await req.db.getAllAgents();
    res.json(agents);
  } catch (error) {
    console.error('获取智能体列表失败:', error);
    res.status(500).json({ error: '获取智能体列表失败' });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const agentData = req.body;
    
    if (!agentData.name || !agentData.systemPrompt) {
      return res.status(400).json({ error: '缺少必要字段: name, systemPrompt' });
    }

    const agentId = await req.db.createAgent({
      name: agentData.name,
      description: agentData.description,
      model: agentData.model || config.DEFAULT_MODEL || 'qwen-plus',
      systemPrompt: agentData.systemPrompt,
      temperature: agentData.temperature || 0.7,
      maxTokens: agentData.maxTokens || 2048,
      tools: agentData.tools || [],
      status: 'inactive'
    });

    res.json({ 
      success: true, 
      agentId,
      message: '智能体创建成功'
    });
  } catch (error) {
    console.error('创建智能体失败:', error);
    res.status(500).json({ error: '创建智能体失败' });
  }
});

app.get('/api/agents/:id', async (req, res) => {
  try {
    const agentId = req.params.id;
    const agent = await req.db.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: '智能体不存在' });
    }
    
    res.json(agent);
  } catch (error) {
    console.error('获取智能体详情失败:', error);
    res.status(500).json({ error: '获取智能体详情失败' });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const agentId = req.params.id;
    const updates = req.body;
    
    const success = await req.db.updateAgent(agentId, updates);
    
    if (!success) {
      return res.status(500).json({ error: '更新智能体失败' });
    }
    
    res.json({ success: true, message: '智能体更新成功' });
  } catch (error) {
    console.error('更新智能体失败:', error);
    res.status(500).json({ error: '更新智能体失败' });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const agentId = req.params.id;
    
    const success = await req.db.deleteAgent(agentId);
    
    if (!success) {
      return res.status(500).json({ error: '删除智能体失败' });
    }
    
    res.json({ success: true, message: '智能体删除成功' });
  } catch (error) {
    console.error('删除智能体失败:', error);
    res.status(500).json({ error: '删除智能体失败' });
  }
});

// 激活智能体
app.post('/api/agents/:id/activate', async (req, res) => {
  try {
    const agentId = req.params.id;
    
    const success = await req.db.updateAgent(agentId, { status: 'active' });
    
    if (!success) {
      return res.status(500).json({ error: '激活智能体失败' });
    }
    
    res.json({ success: true, message: '智能体已激活' });
  } catch (error) {
    console.error('激活智能体失败:', error);
    res.status(500).json({ error: '激活智能体失败' });
  }
});

// 停用智能体
app.post('/api/agents/:id/deactivate', async (req, res) => {
  try {
    const agentId = req.params.id;
    
    const success = await req.db.updateAgent(agentId, { status: 'inactive' });
    
    if (!success) {
      return res.status(500).json({ error: '停用智能体失败' });
    }
    
    res.json({ success: true, message: '智能体已停用' });
  } catch (error) {
    console.error('停用智能体失败:', error);
    res.status(500).json({ error: '停用智能体失败' });
  }
});

// 智能体执行API
app.post('/api/agents/:id/execute', async (req, res) => {
  try {
    const agentId = req.params.id;
    const { input } = req.body;
    
    if (!input) {
      return res.status(400).json({ error: '缺少输入内容' });
    }

    const agent = await req.db.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: '智能体不存在' });
    }

    if (agent.status !== 'active') {
      return res.status(400).json({ error: '智能体未激活' });
    }

    // 创建执行记录
    const executionId = await req.db.createExecution({
      agentId,
      input,
      output: '',
      status: 'running',
      cost: 0,
      duration: 0
    });

    // 调用千问API
    const startTime = Date.now();
    const qwen = new QwenService(config.QWEN_API_KEY);
    
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
    await req.db.updateExecution(executionId, {
      output: outputText,
      status: 'success',
      cost,
      duration
    });

    res.json({
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
    res.status(500).json({ error: '执行智能体失败: ' + error.message });
  }
});

// 执行记录API
app.get('/api/executions', async (req, res) => {
  try {
    const agentId = req.query.agentId;
    const limit = parseInt(req.query.limit || '50');
    
    const executions = await req.db.getExecutions(agentId, limit);
    
    res.json(executions);
  } catch (error) {
    console.error('获取执行记录失败:', error);
    res.status(500).json({ error: '获取执行记录失败' });
  }
});

// API密钥配置API
app.post('/api/config/qwen-key', (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API密钥不能为空' });
    }

    if (!apiKey.startsWith('sk-')) {
      return res.status(400).json({ error: '无效的API密钥格式' });
    }

    // 在实际应用中，这里应该安全地存储API密钥
    config.QWEN_API_KEY = apiKey;

    res.json({ 
      success: true, 
      message: 'API密钥配置成功',
      maskedKey: apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4)
    });
  } catch (error) {
    console.error('配置API密钥失败:', error);
    res.status(500).json({ error: '配置API密钥失败' });
  }
});

// 获取配置状态
app.get('/api/config/status', (req, res) => {
  res.json({
    qwenApiKeyConfigured: !!config.QWEN_API_KEY,
    qwenApiKeyHint: config.QWEN_API_KEY ? 
      config.QWEN_API_KEY.substring(0, 8) + '...' + config.QWEN_API_KEY.substring(config.QWEN_API_KEY.length - 4) :
      null
  });
});

// 模型信息API
app.get('/api/models', (req, res) => {
  res.json(QwenService.getSupportedModels());
});

// 监控API
app.get('/api/metrics', (req, res) => {
  res.json(metricsCollector.getMetrics());
});

app.post('/api/metrics/reset', (req, res) => {
  metricsCollector.reset();
  res.json({ success: true, message: '指标已重置' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('应用错误:', err);
  res.status(500).json({ 
    error: '内部服务器错误',
    message: err.message 
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 智能体管理平台启动成功!`);
  console.log(`📡 服务地址: http://localhost:${PORT}`);
  console.log(`🏥 健康检查: http://localhost:${PORT}/health`);
  console.log(`📊 运行环境: ${config.ENVIRONMENT}`);
  console.log(`🔑 API密钥配置: ${!!config.QWEN_API_KEY ? '已配置' : '未配置'}`);
});

export default app;