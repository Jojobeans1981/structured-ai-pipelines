'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs'
import BuildForm from './build-form'
import DebugForm from './debug-form'

export default function ModeSelector() {
  return (
    <Tabs defaultValue="build" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-6">
        <TabsTrigger value="build">Build Feature</TabsTrigger>
        <TabsTrigger value="debug">Debug & Fix</TabsTrigger>
      </TabsList>
      <TabsContent value="build">
        <BuildForm />
      </TabsContent>
      <TabsContent value="debug">
        <DebugForm />
      </TabsContent>
    </Tabs>
  )
}
