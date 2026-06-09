import { useRef, useEffect } from 'react'
import { useServerStore } from '../../stores'
import { AlertTriangle, Terminal } from 'lucide-react'

const ERROR_HINTS = [
  { pattern: /functional_call.*tied/i, hint: 'CPU offloader crashed on tied weights. CUDA graphs must be disabled.', fix: 'Auto-fixed: CUDA graphs are disabled when CPU offload > 0. If you still see this, restart the server.' },
  { pattern: /cuda out of memory/i, hint: 'GPU ran out of memory (OOM).', fix: 'Reduce --mem-fraction-static, enable FP8 KV cache, or add --cpu-offload-gb' },
  { pattern: /No kernel image.*awq/i, hint: 'AWQ kernel not available for this GPU architecture.', fix: 'Use --load-format safetensors or switch to FP8 if on Hopper GPU' },
  { pattern: /flash_attn.*import|flash_attn.*install/i, hint: 'Flash Attention v2 not installed.', fix: 'pip install flash-attn --no-build-isolation' },
  { pattern: /transformers.*version/i, hint: 'Transformers version conflict.', fix: 'pip install "transformers>=4.44.0"' },
  { pattern: /Torch not compiled with CUDA enabled/i, hint: 'PyTorch installed without CUDA support.', fix: 'pip install torch --index-url https://download.pytorch.org/whl/cu124' },
  { pattern: /CUDA error.*illegal memory/i, hint: 'CUDA illegal memory access — often caused by model/GPU mismatch.', fix: 'Try --disable-cuda-graph, reduce --mem-fraction-static, or use a smaller model' },
]

function LogErrorHints({ lines }: { lines: string[] }) {
  const matched = new Set<string>()
  for (const line of lines) {
    for (const h of ERROR_HINTS) {
      if (h.pattern.test(line) && !matched.has(h.hint)) {
        matched.add(h.hint)
      }
    }
  }
  if (matched.size === 0) return null

  return (
    <div className="mb-3 space-y-1.5">
      {Array.from(matched).map((hint, i) => {
        const entry = ERROR_HINTS.find(h => h.hint === hint)
        if (!entry) return null
        return (
          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg border border-warning/30 bg-warning/10 text-warning text-xs">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">Error detected:</span> {entry.hint}
              <div className="text-[10px] opacity-70 mt-0.5">Fix: {entry.fix}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ServerLogViewer() {
  const { logs } = useServerStore()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="font-semibold text-text text-sm flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" /> Live Console Output
        </h3>
        <span className="text-[10px] bg-surface-2 px-2 py-0.5 rounded font-mono text-text-muted">
          Auto-polling active
        </span>
      </div>

      <LogErrorHints lines={logs} />

      <div className="h-[450px] overflow-y-auto bg-black rounded-lg p-4 font-mono text-xs text-green-400 space-y-1 scrollbar-thin select-text">
        {logs.length === 0 ? (
          <p className="text-text-muted italic">No logs received yet. Launch the server to view output.</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="leading-relaxed break-all whitespace-pre-wrap">
              {line}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
