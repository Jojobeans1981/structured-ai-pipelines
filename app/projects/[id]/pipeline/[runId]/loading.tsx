import { Loader2, Flame } from 'lucide-react';

export default function PipelineLoading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <Flame className="h-10 w-10 text-orange-500/30" />
        <Loader2 className="h-10 w-10 animate-spin text-orange-500 absolute inset-0" />
      </div>
      <p className="text-sm text-zinc-500">Loading pipeline...</p>
    </div>
  );
}
