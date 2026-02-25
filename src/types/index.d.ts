// 智能体类型定义
export interface AgentConfig {
  id?: string;
  name: string;
  description?: string;
  model: 'qwen-turbo' | 'qwen-plus' | 'qwen-max';
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  tools?: string[];
  status: 'active' | 'inactive' | 'error';
  createdAt?: string;
  updatedAt?: string;
}

// 执行记录类型
export interface ExecutionRecord {
  id: string;
  agentId: string;
  input: string;
  output: string;
  status: 'success' | 'error' | 'running';
  cost: number;
  duration: number;
  timestamp: string;
}

// 千问API响应类型
export interface QwenResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// 数据库绑定类型
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  QWEN_API_KEY: string;
  DEFAULT_MODEL: string;
  ENVIRONMENT: string;
}