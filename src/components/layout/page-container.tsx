interface PageContainerProps {
  children: React.ReactNode;
}

export function PageContainer({ children }: PageContainerProps) {
  return (
    <main className="flex-1 overflow-y-auto min-h-0">
      <div className="mx-auto max-w-7xl px-8 py-6">
        {children}
      </div>
    </main>
  );
}
