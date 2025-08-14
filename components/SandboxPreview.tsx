import { useState, useEffect } from 'react';
import { Loader2, ExternalLink, RefreshCw, Terminal } from 'lucide-react';

interface SandboxPreviewProps {
  sandboxId: string;
  port: number;
  type: 'vite' | 'nextjs' | 'console';
  output?: string;
  isLoading?: boolean;
}

export default function SandboxPreview({ 
  sandboxId, 
  port, 
  type, 
  output,
  isLoading = false 
}: SandboxPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [showConsole, setShowConsole] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (sandboxId && type !== 'console') {
      // Ubuntu VPS sandbox handling
      if (sandboxId.includes('.maninfini.com') || sandboxId.includes('maninfini.com')) {
        // Direct subdomain URL from VPS sandbox
        setPreviewUrl(sandboxId.startsWith('http') ? sandboxId : `https://${sandboxId}`);
      } else if (sandboxId.startsWith('sandbox_')) {
        // VPS sandbox ID format - this should be handled by the VPS sandbox system
        // The actual URL will be provided by the VPS sandbox API
        // For now, use a placeholder until the sandbox is fully created
        setPreviewUrl('about:blank');
      } else if (sandboxId.includes('@')) {
        // User-based sandbox format (e.g., "prince32@maninfini.com")
        const userName = sandboxId.split('@')[0];
        setPreviewUrl(`https://${userName}.maninfini.com`);
      } else {
        // Fallback for unknown formats
        setPreviewUrl('about:blank');
      }
    }
  }, [sandboxId, port, type]);

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1);
  };

  // Show loading state for VPS sandboxes that are still being created
  const isVpsSandboxCreating = sandboxId.startsWith('sandbox_') && previewUrl === 'about:blank';

  if (type === 'console') {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="font-mono text-sm whitespace-pre-wrap text-gray-300">
          {output || 'No output yet...'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Preview Controls */}
      <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3 border border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {type === 'vite' ? '⚡ Vite' : '▲ Next.js'} Preview
            {isVpsSandboxCreating && (
              <span className="ml-2 text-xs text-yellow-400">(VPS Sandbox Creating...)</span>
            )}
          </span>
          <code className="text-xs bg-gray-900 px-2 py-1 rounded text-blue-400">
            {isVpsSandboxCreating ? 'Initializing...' : previewUrl}
          </code>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConsole(!showConsole)}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Toggle console"
          >
            <Terminal className="w-4 h-4" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="Refresh preview"
            disabled={isVpsSandboxCreating}
          >
            <RefreshCw className={`w-4 h-4 ${isVpsSandboxCreating ? 'opacity-50' : ''}`} />
          </button>
          <a
            href={isVpsSandboxCreating ? '#' : previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded transition-colors ${
              isVpsSandboxCreating 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:bg-gray-700'
            }`}
            title={isVpsSandboxCreating ? 'Sandbox still creating...' : 'Open in new tab'}
            onClick={isVpsSandboxCreating ? (e) => e.preventDefault() : undefined}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Main Preview */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
        {(isLoading || isVpsSandboxCreating) && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center z-10">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {isVpsSandboxCreating 
                  ? 'Creating Ubuntu VPS sandbox...' 
                  : type === 'vite' 
                    ? 'Starting Vite dev server...' 
                    : 'Starting Next.js dev server...'
                }
              </p>
              {isVpsSandboxCreating && (
                <p className="text-xs text-gray-500 mt-2">
                  Setting up subdomain and React app...
                </p>
              )}
            </div>
          </div>
        )}
        
        <iframe
          key={iframeKey}
          src={previewUrl}
          className="w-full h-[600px] bg-white"
          title={`${type} preview`}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>

      {/* Console Output (Toggle) */}
      {showConsole && output && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-400">Console Output</span>
          </div>
          <div className="font-mono text-xs whitespace-pre-wrap text-gray-300 max-h-48 overflow-y-auto">
            {output}
          </div>
        </div>
      )}

      {/* VPS Sandbox Status Info */}
      {isVpsSandboxCreating && (
        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-semibold text-blue-400">Ubuntu VPS Sandbox</span>
          </div>
          <p className="text-sm text-blue-300">
            Creating your personal sandbox environment on our Ubuntu VPS...
          </p>
          <ul className="text-xs text-blue-400 mt-2 space-y-1">
            <li>• Setting up unique subdomain</li>
            <li>• Installing React + Vite + Tailwind</li>
            <li>• Configuring Nginx proxy</li>
            <li>• Starting development server</li>
          </ul>
        </div>
      )}
    </div>
  );
}