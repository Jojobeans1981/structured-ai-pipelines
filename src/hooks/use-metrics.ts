'use client';

import { useState, useEffect, useCallback } from 'react';
import { type MetricsSummary, type MetricHistoryEntry } from '@/src/types/metrics';

export function useMetricsSummary() {
  const [data, setData] = useState<MetricsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) throw new Error('Failed to fetch metrics');
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, isLoading, error, refetch: fetch_ };
}

export function useMetricsHistory(type?: string, limit: number = 20) {
  const [data, setData] = useState<MetricHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLimit, setCurrentLimit] = useState(limit);

  const fetch_ = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      params.set('limit', String(currentLimit));
      const res = await fetch(`/api/metrics/history?${params}`);
      if (!res.ok) throw new Error('Failed to fetch history');
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [type, currentLimit]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const loadMore = () => setCurrentLimit((prev) => prev + 20);

  return { data, isLoading, error, refetch: fetch_, loadMore };
}
