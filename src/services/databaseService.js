import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';

export class DatabaseService {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  // 初始化数据库连接和表
  async initializeTables() {
    if (!this.db) {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });
    }

    const queries = [
      `
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          model TEXT NOT NULL,
          system_prompt TEXT NOT NULL,
          temperature REAL DEFAULT 0.7,
          max_tokens INTEGER DEFAULT 2048,
          tools TEXT,
          status TEXT DEFAULT 'inactive',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          input TEXT NOT NULL,
          output TEXT,
          status TEXT DEFAULT 'running',
          cost REAL DEFAULT 0,
          duration INTEGER DEFAULT 0,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agent_id) REFERENCES agents (id)
        )
      `
    ];

    for (const query of queries) {
      await this.db.exec(query);
    }
  }

  // 创建智能体
  async createAgent(agent) {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    await this.db.run(`
      INSERT INTO agents (
        id, name, description, model, system_prompt, 
        temperature, max_tokens, tools, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, agent.name, agent.description, agent.model, agent.systemPrompt,
      agent.temperature, agent.maxTokens, JSON.stringify(agent.tools || []), 
      agent.status, now, now
    ]);

    return id;
  }

  // 获取智能体
  async getAgent(id) {
    const row = await this.db.get(`
      SELECT * FROM agents WHERE id = ?
    `, [id]);

    return row ? this.formatAgent(row) : null;
  }

  // 获取所有智能体
  async getAllAgents() {
    const rows = await this.db.all(`
      SELECT * FROM agents ORDER BY created_at DESC
    `);

    return rows.map(this.formatAgent);
  }

  // 更新智能体
  async updateAgent(id, updates) {
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${this.camelToSnake(key)} = ?`);
        values.push(
          key === 'tools' 
            ? JSON.stringify(updates[key]) 
            : updates[key]
        );
      }
    });

    if (fields.length === 0) return false;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const result = await this.db.run(`
      UPDATE agents SET ${fields.join(', ')} WHERE id = ?
    `, values);

    return result.changes > 0;
  }

  // 删除智能体
  async deleteAgent(id) {
    const result = await this.db.run(`
      DELETE FROM agents WHERE id = ?
    `, [id]);

    return result.changes > 0;
  }

  // 创建执行记录
  async createExecution(execution) {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    await this.db.run(`
      INSERT INTO executions (
        id, agent_id, input, output, status, cost, duration, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, execution.agentId, execution.input, execution.output,
      execution.status, execution.cost, execution.duration, timestamp
    ]);

    return id;
  }

  // 更新执行记录
  async updateExecution(id, updates) {
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    });

    if (fields.length === 0) return false;

    values.push(id);

    const result = await this.db.run(`
      UPDATE executions SET ${fields.join(', ')} WHERE id = ?
    `, values);

    return result.changes > 0;
  }

  // 获取执行记录
  async getExecutions(agentId, limit = 50) {
    let query = 'SELECT * FROM executions';
    const params = [];

    if (agentId) {
      query += ' WHERE agent_id = ?';
      params.push(agentId);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = await this.db.all(query, params);
    return rows.map(this.formatExecution);
  }

  // 工具方法
  camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  formatAgent(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      model: row.model,
      systemPrompt: row.system_prompt,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      tools: row.tools ? JSON.parse(row.tools) : [],
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  formatExecution(row) {
    return {
      id: row.id,
      agentId: row.agent_id,
      input: row.input,
      output: row.output,
      status: row.status,
      cost: row.cost,
      duration: row.duration,
      timestamp: row.timestamp
    };
  }
}