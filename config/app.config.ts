// Application Configuration
// This file contains all configurable settings for the application

export const appConfig = {
  // Sandbox Configuration (VPS-based)
  sandbox: {
    // Sandbox type: 'vps' or 'e2b'
    type: 'vps' as 'vps' | 'e2b',
    
    // Sandbox timeout in minutes
    timeoutMinutes: 15,
    
    // Convert to milliseconds for API
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000;
    },
    
    // Vite development server port
    vitePort: 5173,
    
    // Time to wait for Vite to be ready (in milliseconds)
    viteStartupDelay: 7000,
    
    // Time to wait for CSS rebuild (in milliseconds)
    cssRebuildDelay: 2000,
    
    // VPS Configuration
    vps: {
      baseDir: '/var/www/manimaker',
      sandboxDir: '/var/www/manimaker/sandboxes',
      sitesDir: '/var/www/sites',
      domain: 'ai.maninfini.com',
      baseDomain: 'maninfini.com',
      nginxConfig: '/etc/nginx/sites-enabled/manimaker',
      nginxSitesDir: '/etc/nginx/sites-available',
      nginxEnabledDir: '/etc/nginx/sites-enabled',
      user: 'www-data',
      group: 'www-data',
      defaultPort: 3000,
      sitePortStart: 4000
    },
    
    // E2B Configuration (legacy)
    e2b: {
      defaultTemplate: undefined, // or specify a template ID
    }
  },

  // Legacy e2b property for backward compatibility
  get e2b() {
    return {
      ...this.sandbox,
      ...this.sandbox.e2b
    };
  },
  
  // AI Model Configuration
  ai: {
    // Default AI model
    defaultModel: 'google/gemini-2.5-pro',
    
    // Available models
    availableModels: [
      'google/gemini-2.5-pro'
    ],
    
    // Model display names
    modelDisplayNames: {
      'google/gemini-2.5-pro': 'Gemini 2.5 Pro'
    },
    
    // Temperature settings for non-reasoning models
    defaultTemperature: 0.7,
    
    // Max tokens for code generation
    maxTokens: 8000,
    
    // Max tokens for truncation recovery
    truncationRecoveryMaxTokens: 4000,
  },
  
  // Code Application Configuration
  codeApplication: {
    // Delay after applying code before refreshing iframe (milliseconds)
    defaultRefreshDelay: 2000,
    
    // Delay when packages are installed (milliseconds)
    packageInstallRefreshDelay: 5000,
    
    // Enable/disable automatic truncation recovery
    enableTruncationRecovery: false, // Disabled - too many false positives
    
    // Maximum number of truncation recovery attempts per file
    maxTruncationRecoveryAttempts: 1,
  },
  
  // UI Configuration
  ui: {
    // Show/hide certain UI elements
    showModelSelector: false,
    showStatusIndicator: true,
    
    // Animation durations (milliseconds)
    animationDuration: 200,
    
    // Toast notification duration (milliseconds)
    toastDuration: 3000,
    
    // Maximum chat messages to keep in memory
    maxChatMessages: 100,
    
    // Maximum recent messages to send as context
    maxRecentMessagesContext: 20,
  },
  
  // Development Configuration
  dev: {
    // Enable debug logging
    enableDebugLogging: true,
    
    // Enable performance monitoring
    enablePerformanceMonitoring: false,
    
    // Log API responses
    logApiResponses: true,
  },
  
  // Package Installation Configuration
  packages: {
    // Use --legacy-peer-deps flag for npm install
    useLegacyPeerDeps: true,
    
    // Package installation timeout (milliseconds)
    installTimeout: 60000,
    
    // Auto-restart Vite after package installation
    autoRestartVite: true,
  },
  
  // File Management Configuration
  files: {
    // Excluded file patterns (files to ignore)
    excludePatterns: [
      'node_modules/**',
      '.git/**',
      '.next/**',
      'dist/**',
      'build/**',
      '*.log',
      '.DS_Store'
    ],
    
    // Maximum file size to read (bytes)
    maxFileSize: 1024 * 1024, // 1MB
    
    // File extensions to treat as text
    textFileExtensions: [
      '.js', '.jsx', '.ts', '.tsx',
      '.css', '.scss', '.sass',
      '.html', '.xml', '.svg',
      '.json', '.yml', '.yaml',
      '.md', '.txt', '.env',
      '.gitignore', '.dockerignore'
    ],
  },
  
  // API Endpoints Configuration (for external services)
  api: {
    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000, // milliseconds
    
    // Request timeout (milliseconds)
    requestTimeout: 30000,
  }
};

// Type-safe config getter
export function getConfig<K extends keyof typeof appConfig>(key: K): typeof appConfig[K] {
  return appConfig[key];
}

// Helper to get nested config values
export function getConfigValue(path: string): any {
  return path.split('.').reduce((obj, key) => obj?.[key], appConfig as any);
}

export default appConfig;