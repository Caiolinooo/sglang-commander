import { useServerStore } from '../../stores'
import { Switch } from '../ui/Switch'
import { Slider } from '../ui/Slider'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { HardDrive, Play, Square, RotateCw } from 'lucide-react'

const QUANT_OPTIONS = [
  { value: '', label: 'None', desc: 'Full precision (fp16/bf16)' },
  { value: 'awq', label: 'AWQ 4-bit', desc: 'Best quality/size' },
  { value: 'fp8', label: 'FP8', desc: 'Hopper GPUs' },
  { value: 'gptq', label: 'GPTQ 4-bit', desc: 'Fast inference' },
  { value: 'bitsandbytes', label: 'BnB 4-bit', desc: 'Universal fallback' },
]

const DTYPE_OPTIONS = [
  { value: 'auto', label: 'auto', desc: 'Let model config decide (recommended)' },
  { value: 'half', label: 'fp16', desc: '16-bit float. 2x memory vs fp32.' },
  { value: 'bfloat16', label: 'bf16', desc: 'Brain float. Same memory as fp16, better training range.' },
  { value: 'float32', label: 'fp32', desc: 'Full 32-bit precision. Only needed for debugging.' },
]

export default function ServerConfigPanel() {
  const {
    config,
    advanced,
    status,
    loading,
    setConfig,
    setAdvanced,
    showAdvanced,
    setShowAdvanced,
    startServer,
    stopServer,
    restartServer
  } = useServerStore()

  const handleStart = async () => {
    try {
      await startServer()
    } catch (e) {
      console.error(e)
    }
  }

  const update = (f: string, v: any) => {
    setConfig(prev => ({ ...prev, [f]: v }))
  }

  const updateA = (f: string, v: any) => {
    setAdvanced(prev => ({ ...prev, [f]: v }))
  }

  const buildCommandPreview = () => {
    const parts = ['python3 -m sglang.launch_server']
    if (config.model_path) parts.push(`--model-path "${config.model_path}"`)
    if (config.host) parts.push(`--host ${config.host}`)
    if (config.port) parts.push(`--port ${config.port}`)
    if (config.tensor_parallel_size > 1) parts.push(`--tensor-parallel-size ${config.tensor_parallel_size}`)
    if (config.quantization && config.quantization !== 'None') parts.push(`--quantization ${config.quantization}`)
    if (config.dtype && config.dtype !== 'auto') parts.push(`--dtype ${config.dtype}`)
    if (config.context_length) parts.push(`--context-length ${config.context_length}`)
    if (config.enable_multimodal) parts.push('--enable-multimodal')
    if (config.trust_remote_code) parts.push('--trust-remote-code')
    
    // Add some key advanced args if they differ from default
    if (advanced.mem_fraction_static !== 0.88) parts.push(`--mem-fraction-static ${advanced.mem_fraction_static}`)
    if (advanced.cpu_offload_gb > 0) parts.push(`--cpu-offload-gb ${advanced.cpu_offload_gb}`)
    if (advanced.speculative_algorithm) parts.push(`--speculative-algorithm ${advanced.speculative_algorithm}`)
    if (advanced.kv_cache_dtype) parts.push(`--kv-cache-dtype ${advanced.kv_cache_dtype}`)
    parts.push('--enable-metrics')
    return parts.join(' \\\n  ')
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-text text-sm flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" /> Model Path & Network Settings
        </h3>
        
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-muted">Model Path (HuggingFace repo or local path)</label>
            <Input 
              value={config.model_path} 
              onChange={e => update('model_path', e.target.value)} 
              placeholder="e.g. meta-llama/Llama-3.2-3B-Instruct" 
              className="h-9 font-mono text-xs"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Host</label>
              <Input value={config.host} onChange={e => update('host', e.target.value)} placeholder="127.0.0.1" className="h-9 font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Port</label>
              <Input type="number" value={config.port} onChange={e => update('port', Number(e.target.value))} placeholder="30000" className="h-9 font-mono text-xs" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-text text-sm">Quantization & Precision</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select 
            label="Quantization Method"
            options={QUANT_OPTIONS}
            value={config.quantization}
            onChange={v => update('quantization', v)}
          />
          <Select 
            label="Data Type (Dtype)"
            options={DTYPE_OPTIONS}
            value={config.dtype}
            onChange={v => update('dtype', v)}
          />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-text text-sm">Key Resource Allocations</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-primary font-bold">
            {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Context Length</label>
              <Input type="number" value={config.context_length} onChange={e => update('context_length', Number(e.target.value))} placeholder="0 = default" className="h-9 font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Tensor Parallelism (GPUs)</label>
              <Input type="number" value={config.tensor_parallel_size} onChange={e => update('tensor_parallel_size', Number(e.target.value))} min={1} max={8} className="h-9 font-mono text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Switch checked={config.enable_multimodal} onChange={v => update('enable_multimodal', v)} label="Enable Multimodal (Vision)" />
            <Switch checked={config.trust_remote_code} onChange={v => update('trust_remote_code', v)} label="Trust Remote Code" />
          </div>

          {showAdvanced && (
            <div className="pt-4 border-t border-border space-y-4 animate-fade-in">
              <Slider 
                label="Static Memory Fraction (static cache allocation)"
                value={advanced.mem_fraction_static}
                onChange={v => updateA('mem_fraction_static', v)}
                min={0.1}
                max={0.95}
                step={0.01}
                format={v => v.toFixed(2)}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-muted">CPU Offload (GB)</label>
                  <Input type="number" value={advanced.cpu_offload_gb} onChange={e => updateA('cpu_offload_gb', Number(e.target.value))} placeholder="0 = disabled" className="h-9 font-mono text-xs" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-muted">KV Cache Dtype</label>
                  <select value={advanced.kv_cache_dtype} onChange={e => updateA('kv_cache_dtype', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border text-xs text-text">
                    <option value="">auto</option>
                    <option value="fp8">FP8 (Highly recommended for saving memory)</option>
                    <option value="fp16">FP16</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Switch checked={advanced.disable_cuda_graph} onChange={v => updateA('disable_cuda_graph', v)} label="Disable CUDA Graphs" />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-muted">Speculative Algorithm</label>
                  <select value={advanced.speculative_algorithm} onChange={e => updateA('speculative_algorithm', e.target.value)} className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text">
                    <option value="">None</option>
                    <option value="EAGLE">EAGLE (Speculative decoding)</option>
                    <option value="NGRAM">N-gram</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-text text-sm">Server Launcher Action</h3>
        <div className="flex gap-3">
          <Button onClick={handleStart} disabled={loading || status.running} className="flex-1 gap-2">
            <Play className="h-4 w-4" /> Deploy & Start SGLang
          </Button>
          {status.running && (
            <>
              <Button onClick={restartServer} className="flex-1 gap-2 variant-secondary">
                <RotateCw className="h-4 w-4" /> Restart
              </Button>
              <Button onClick={stopServer} variant="danger" className="flex-1 gap-2">
                <Square className="h-4 w-4" /> Stop Server
              </Button>
            </>
          )}
        </div>

        <div className="bg-surface-2/60 border border-border rounded-lg p-4">
          <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Command Preview</p>
          <pre className="text-[10px] font-mono text-text overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {buildCommandPreview()}
          </pre>
        </div>
      </div>
    </div>
  )
}
