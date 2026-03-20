'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { KeyRound, Trash2, Check, Flame } from 'lucide-react';

interface ApiKeyFormProps {
  hasApiKey: boolean;
}

export function ApiKeyForm({ hasApiKey: initialHasKey }: ApiKeyFormProps) {
  const [hasApiKey, setHasApiKey] = useState(initialHasKey);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      if (!res.ok) {
        let errorMsg = 'Failed to save API key';
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          if (res.status === 401) errorMsg = 'Not authenticated. Please sign in again.';
        }
        throw new Error(errorMsg);
      }

      setHasApiKey(true);
      setApiKey('');
      setMessage({ type: 'success', text: 'API key forged into the vault' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/api-key', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete API key');

      setHasApiKey(false);
      setMessage({ type: 'success', text: 'API key removed from the vault' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-orange-400" />
          Anthropic API Key
        </CardTitle>
        <CardDescription>
          Your API key is encrypted at rest with AES-256-GCM and never shown after saving.
          The forge uses your key to call Claude during pipeline execution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasApiKey ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-zinc-300">API key forged and ready</span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isLoading}
                className="bg-zinc-900/50 border-zinc-700 focus:border-orange-500/50 focus:ring-orange-500/20"
              />
              <Button onClick={handleSave} disabled={isLoading || !apiKey.trim()}>
                <Flame className="mr-2 h-4 w-4" />
                Forge
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              Get your API key from the Anthropic Console. Starts with sk-ant-
            </p>
          </div>
        )}
        {message && (
          <p className={`text-sm ${message.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
