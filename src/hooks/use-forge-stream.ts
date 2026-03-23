'use client'

import { useEffect } from 'react'
import { useForgeStore } from '@/src/stores/forge-store'

export function useForgeStream(url: string | null): void {
  const addLog = useForgeStore((s) => s.addLog)
  const setDiff = useForgeStore((s) => s.setDiff)
  const setDiagnosis = useForgeStore((s) => s.setDiagnosis)
  const setPlanData = useForgeStore((s) => s.setPlanData)
  const setStatus = useForgeStore((s) => s.setStatus)
  const setStage = useForgeStore((s) => s.setStage)

  useEffect(() => {
    if (!url) return

    const es = new EventSource(url)

    es.addEventListener('log', (e: MessageEvent) => {
      const data = JSON.parse(e.data as string)
      addLog({ step: data.step, level: data.level, message: data.message })
    })

    es.addEventListener('diff', (e: MessageEvent) => {
      const data = JSON.parse(e.data as string)
      setDiff({
        files: data.files,
        lintPassed: data.lintPassed,
        testsPassed: data.testsPassed,
        errors: data.errors,
      })
    })

    es.addEventListener('diagnosis', (e: MessageEvent) => {
      const data = JSON.parse(e.data as string)
      setDiagnosis({
        rootCause: data.rootCause,
        affectedFiles: data.affectedFiles,
        fixPlan: data.fixPlan,
      })
    })

    es.addEventListener('plan', (e: MessageEvent) => {
      const data = JSON.parse(e.data as string)
      setPlanData(data)
      setStage('plan')
    })

    es.addEventListener('status', (e: MessageEvent) => {
      const data = JSON.parse(e.data as string)
      setStatus(data.status)
      if (data.stage !== undefined) {
        setStage(data.stage)
      }
    })

    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()

    return () => es.close()
  }, [url, addLog, setDiff, setDiagnosis, setPlanData, setStatus, setStage])
}
