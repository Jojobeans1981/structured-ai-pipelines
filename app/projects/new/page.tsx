import { notFound } from 'next/navigation';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { ProjectForm } from '@/src/components/project/project-form';
import { forgeDeliveryPromises, forgeTrustSignals } from '@/src/lib/product-offerings';
import { ShieldCheck, PackageCheck, Rocket } from 'lucide-react';

export default async function NewProjectPage() {
  const session = await getSessionOrDemo();
  if (!session?.user?.id) notFound();

  return (
    <>
      <Header title="New Project" />
      <PageContainer>
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <PackageCheck className="h-4 w-4 text-emerald-400" />
                What Ships
              </div>
              <div className="mt-3 space-y-2 text-sm text-zinc-400">
                {forgeDeliveryPromises.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                Why It Feels Safe
              </div>
              <div className="mt-3 space-y-2 text-sm text-zinc-400">
                {forgeTrustSignals.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-200">
                <Rocket className="h-4 w-4 text-orange-400" />
                Best Outcome
              </div>
              <p className="mt-3 text-sm leading-6 text-orange-100/80">
                Use this flow when you want something you can demo, hand off, or iterate on quickly instead of staring at a blank repo.
              </p>
            </div>
          </div>
          <ProjectForm />
        </div>
      </PageContainer>
    </>
  );
}
