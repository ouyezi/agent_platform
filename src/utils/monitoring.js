export class Logger {
  static info(message, data = {}) {
    console.log(JSON.stringify({
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      ...data
    }));
  }

  static error(message, error, data = {}) {
    console.error(JSON.stringify({
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      error: error.message || error,
      stack: error.stack,
      ...data
    }));
  }

  static warn(message, data = {}) {
    console.warn(JSON.stringify({
      level: 'WARN',
      timestamp: new Date().toISOString(),
      message,
      ...data
    }));
  }
}

export class MetricsCollector {
  constructor() {
    this.metrics = {
      apiCalls: 0,
      totalCost: 0,
      avgResponseTime: 0,
      errorCount: 0
    };
  }

  recordAPICall(duration, cost, success = true) {
    this.metrics.apiCalls++;
    this.metrics.totalCost += cost;
    
    if (success) {
      // 更新平均响应时间
      this.metrics.avgResponseTime = (
        (this.metrics.avgResponseTime * (this.metrics.apiCalls - 1) + duration) / 
        this.metrics.apiCalls
      );
    } else {
      this.metrics.errorCount++;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.apiCalls > 0 
        ? ((this.metrics.apiCalls - this.metrics.errorCount) / this.metrics.apiCalls * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  reset() {
    this.metrics = {
      apiCalls: 0,
      totalCost: 0,
      avgResponseTime: 0,
      errorCount: 0
    };
  }
}

// 全局监控实例
export const metricsCollector = new MetricsCollector();