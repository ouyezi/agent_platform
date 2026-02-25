export class QwenService {
  constructor(apiKey) {
    // 优先使用传入的apiKey，否则尝试从localStorage获取（本地开发用）
    this.apiKey = apiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('qwen_api_key') : null);
    this.baseUrl = 'https://dashscope.aliyuncs.com/api/v1';
    
    if (!this.apiKey) {
      throw new Error('未配置千问API密钥，请在配置页面设置API密钥');
    }
  }

  // 调用千问聊天API
  async chat(messages, model = 'qwen-plus', options = {}) {
    const requestBody = {
      model: model,
      input: {
        messages: messages
      },
      parameters: {
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
        top_p: options.topP || 0.8
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/services/aigc/text-generation/generation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'disable'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`千问API调用失败: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('千问API响应:', JSON.stringify(data, null, 2)); // 调试日志
      
      // 记录API使用情况
      this.recordUsage(data.usage?.total_tokens || 0, model);
      
      return data;
    } catch (error) {
      console.error('千问API调用错误:', error);
      throw error;
    }
  }

  // 获取支持的模型列表
  static getSupportedModels() {
    return [
      {
        id: 'qwen-turbo',
        name: '通义千问 Turbo',
        description: '高速推理模型，适合简单任务',
        maxTokens: 8192,
        cost: '低'
      },
      {
        id: 'qwen-plus',
        name: '通义千问 Plus',
        description: '平衡性能模型，推荐默认使用',
        maxTokens: 32768,
        cost: '中'
      },
      {
        id: 'qwen-max',
        name: '通义千问 Max',
        description: '最强推理模型，适合复杂场景',
        maxTokens: 8192,
        cost: '高'
      }
    ];
  }

  // 记录API使用情况
  recordUsage(tokens, model) {
    console.log(`[Qwen Usage] Model: ${model}, Tokens: ${tokens}`);
  }

  // 计算预估成本
  static estimateCost(model, tokens) {
    const pricing = {
      'qwen-turbo': 0.0008,
      'qwen-plus': 0.004,
      'qwen-max': 0.02
    };
    
    const pricePerThousand = pricing[model] || 0.004;
    return (tokens / 1000) * pricePerThousand;
  }
}