import { Loader2 } from 'lucide-react';

export default function ProjectLoading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
    </div>
  );
}
