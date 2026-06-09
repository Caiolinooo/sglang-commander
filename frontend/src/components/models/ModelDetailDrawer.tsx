import { useState, useEffect } from 'react'
import { useModelsStore, useServerStore } from '../../stores'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Switch } from '../ui/Switch'
import { toast } from '../ui/Toast'
import { getDeploymentRecommendations, getQuantVariants, getModelConfig, deployModel } from '../../api/endpoints'
import { Cpu, RotateCw, Play } from 'lucide-react'
import { cn } from '../ui/cn'
import type { HFModel } from '../../types'

interface ModelDetailDrawerProps {
  model: HFModel | null
  open: boolean
  onClose: () => void
}

export default function ModelDetailDrawer({ model, open, onClose }: ModelDetailDrawerProps) {
  const { gpuInfo } = useModelsStore()
  const { fetchStatus } = useServerStore()
  
  const [quantization, setQuantization] = useState('')
  const [dtype, setDtype] = useState('auto')
  const [contextLength, setContextLength] = useState(0)
  const [tensorParallelSize, setTensorParallelSize] = useState(1)
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState(30000)
  const [trustRemoteCode, setTrustRemoteCode] = useState(true)
  const [toolCallParser, setToolCallParser] = useState('')
  const [reasoningParser, setReasoningParser] = useState('')
  const [enableMultimodal, setEnableMultimodal] = useState(false)
  const [loadFormat, setLoadFormat] = useState('')
  const [speculativeAlgorithm, setSpeculativeAlgorithm] = useState('')
  const [speculativeNumSteps, setSpeculativeNumSteps] = useState(3)
  const [speculativeDraftModelPath, setSpeculativeDraftModelPath] = useState('')
  
  const [deploying, setDeploying] = useState(false)
  const [quantVariants, setQuantVariants] = useState<any[]>([])

  // Auto-detect defaults on select
  useEffect(() => {
    if (!model) return

    const name = model.model_name.toLowerCase()
    
    // Reset inputs
    setQuantization(model.quantization || '')
    setDtype('auto')
    setTensorParallelSize(1)
    setHost('127.0.0.1')
    setPort(30000)
    setTrustRemoteCode(true)
    setSpeculativeAlgorithm('')
    setSpeculativeDraftModelPath('')
    
    // Autodetect parsers
    if (name.includes('llama-3') || name.includes('llama3')) {
      setToolCallParser('llama3')
    } else if (name.includes('qwen3') || name.includes('qwen2.5') || name.includes('qwen25')) {
      setToolCallParser('qwen3_coder')
    } else if (name.includes('qwen')) {
      setToolCallParser('qwen')
    } else {
      setToolCallParser('')
    }

    if (name.includes('deepseek-r1') || name.includes('deepseek_r1')) {
      setReasoningParser('deepseek-r1')
    } else {
      setReasoningParser('')
    }

    setEnableMultimodal(name.includes('vision') || name.includes('vl') || name.includes('llava'))
    setLoadFormat(name.includes('.gguf') ? 'gguf' : '')

    // Load extra model configs
    getQuantVariants(model.repo_id)
      .then(r => setQuantVariants(r.data.variants || []))
      .catch(() => {})

    // Load recommendations
    getModelConfig(model.repo_id)
      .then(r => {
        const cfg = r.data
        if (cfg && cfg.recommended) {
          const rec = cfg.recommended
          if (rec.tool_call_parser) setToolCallParser(rec.tool_call_parser)
          if (rec.reasoning_parser) setReasoningParser(rec.reasoning_parser)
          if (rec.enable_multimodal !== undefined) setEnableMultimodal(rec.enable_multimodal)
          if (rec.load_format) setLoadFormat(rec.load_format)
          if (rec.dtype) setDtype(rec.dtype)
        }
      })
      .catch(() => {})

  }, [model])

  if (!model) return null

  const handleApplySmart = async () => {
    try {
      const resp = await getDeploymentRecommendations(model.repo_id)
      const rec = resp.data?.recommendations
      if (rec) {
        if (rec.quantization) setQuantization(rec.quantization)
        if (rec.dtype) setDtype(rec.dtype)
        if (rec.context_length) setContextLength(rec.context_length)
        if (rec.tensor_parallel_size) setTensorParallelSize(rec.tensor_parallel_size)
        if (rec.enable_multimodal !== undefined) setEnableMultimodal(rec.enable_multimodal)
        if (rec.speculative_algorithm) setSpeculativeAlgorithm(rec.speculative_algorithm)
        if (rec.speculative_num_steps) setSpeculativeNumSteps(rec.speculative_num_steps)
        toast.success("Applied smart configuration recommendations.")
      } else {
        toast.warning("No custom recommendations found. Defaults retained.")
      }
    } catch {
      toast.error("Failed to load recommendations.")
    }
  }

  const handleLaunch = async () => {
    setDeploying(true)
    try {
      await deployModel({
        repo_id: model.repo_id,
        quantization: quantization || undefined,
        dtype,
        context_length: contextLength || undefined,
        tensor_parallel_size: tensorParallelSize,
        host,
        port,
        trust_remote_code: trustRemoteCode,
        tool_call_parser: toolCallParser || undefined,
        reasoning_parser: reasoningParser || undefined,
        enable_multimodal: enableMultimodal || undefined,
        load_format: loadFormat || undefined,
        speculative_algorithm: speculativeAlgorithm || undefined,
        speculative_num_steps: speculativeAlgorithm ? speculativeNumSteps : undefined,
        speculative_draft_model_path: speculativeDraftModelPath || undefined,
      })
      toast.success("Server started with the model successfully!")
      fetchStatus()
      onClose()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Failed to start model server")
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Configure & Launch" className="w-[480px]">
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-bold text-text truncate">{model.model_name}</h4>
          <p className="text-[11px] font-mono text-text-muted mt-1 leading-normal truncate">{model.repo_id}</p>
        </div>

        <div className="bg-surface-2/50 border border-border rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Specifications</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-muted">Parameters:</span>{' '}
              <strong className="text-text">{model.params_billions ? `${model.params_billions}B` : 'Unknown'}</strong>
            </div>
            <div>
              <span className="text-text-muted">Estimated VRAM:</span>{' '}
              <strong className="text-text">{model.vram_estimate_gb ? `${model.vram_estimate_gb} GB` : 'N/A'}</strong>
            </div>
            {gpuInfo && (
              <div className="col-span-2 text-[10px] text-text-muted mt-1">
                Active Hardware: {gpuInfo.name} ({gpuInfo.free_gb} GB free)
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleApplySmart} className="flex-1 gap-1 text-xs">
              <Cpu size={12} /> Get Smart Config
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuantization('')} className="flex-1 gap-1 text-xs">
              <RotateCw size={12} /> Reset Config
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Quantization</label>
              <select 
                value={quantization} 
                onChange={e => setQuantization(e.target.value)}
                className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="">None (fp16/bf16)</option>
                <option value="awq">AWQ (4-bit)</option>
                <option value="fp8">FP8 (Highly recommended)</option>
                <option value="gptq">GPTQ (4-bit)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Dtype</label>
              <select 
                value={dtype} 
                onChange={e => setDtype(e.target.value)}
                className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="auto">auto</option>
                <option value="half">float16</option>
                <option value="bfloat16">bfloat16</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Context Length</label>
              <Input 
                type="number" 
                value={contextLength || ''} 
                onChange={e => setContextLength(Number(e.target.value))} 
                placeholder="0 = default"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Tensor Parallel</label>
              <Input 
                type="number" 
                value={tensorParallelSize} 
                onChange={e => setTensorParallelSize(Number(e.target.value))} 
                min={1} max={8}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Host</label>
              <Input 
                value={host} 
                onChange={e => setHost(e.target.value)} 
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Port</label>
              <Input 
                type="number" 
                value={port} 
                onChange={e => setPort(Number(e.target.value))} 
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-border">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Smart Auto-Detectors</p>
            <div className="grid grid-cols-2 gap-4">
              <Switch checked={enableMultimodal} onChange={setEnableMultimodal} label="Multimodal (Vision)" />
              <Switch checked={trustRemoteCode} onChange={setTrustRemoteCode} label="Trust Remote Code" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">Tool Calling Parser</label>
                <select 
                  value={toolCallParser} 
                  onChange={e => setToolCallParser(e.target.value)}
                  className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text"
                >
                  <option value="">None</option>
                  <option value="llama3">llama3</option>
                  <option value="qwen">qwen</option>
                  <option value="qwen3_coder">qwen3_coder</option>
                  <option value="mistral">mistral</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">Reasoning Parser</label>
                <select 
                  value={reasoningParser} 
                  onChange={e => setReasoningParser(e.target.value)}
                  className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text"
                >
                  <option value="">None</option>
                  <option value="deepseek-r1">deepseek-r1</option>
                  <option value="qwen3">qwen3</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-border">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Speculative Decoding (MTP)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">Speculative Algo</label>
                <select 
                  value={speculativeAlgorithm} 
                  onChange={e => setSpeculativeAlgorithm(e.target.value)}
                  className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text"
                >
                  <option value="">None</option>
                  <option value="EAGLE">EAGLE (Fast MTP)</option>
                  <option value="NGRAM">N-gram (Simple)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">Steps</label>
                <Input 
                  type="number" 
                  value={speculativeNumSteps} 
                  onChange={e => setSpeculativeNumSteps(Number(e.target.value))} 
                  min={1} max={10}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {quantVariants.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Quantization Formats on HF</p>
            <div className="flex flex-wrap gap-1.5">
              {quantVariants.slice(0, 5).map(v => (
                <button
                  key={v.repo_id}
                  onClick={() => setQuantization(v.quantization)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer",
                    quantization === v.quantization ? "bg-primary/20 text-primary border-primary" : "bg-surface-2 text-text-muted border-border hover:border-primary/50"
                  )}
                >
                  {v.quantization.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button onClick={handleLaunch} disabled={deploying} className="w-full gap-2 mt-4 font-bold">
          {deploying ? <RotateCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {deploying ? 'Deploying Server...' : 'Start Runtime'}
        </Button>
      </div>
    </Drawer>
  )
}
