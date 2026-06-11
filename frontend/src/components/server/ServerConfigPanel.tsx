import { useState, useEffect } from 'react'
import { useServerStore } from '../../stores'
import { Switch } from '../ui/Switch'
import { Slider } from '../ui/Slider'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs'
import { Tooltip } from '../ui/Tooltip'
import { HardDrive, Play, Square, RotateCw, ChevronDown, Wand2, Info } from 'lucide-react'
import { getVramEstimate } from '../../api/endpoints'

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

const SUGGESTION_DETAILS: Record<string, { params_billions: number, quantization: string, context_length: number, is_multimodal: boolean }> = {
  'meta-llama/Llama-3.2-1B-Instruct': { params_billions: 1, quantization: '', context_length: 131072, is_multimodal: false },
  'meta-llama/Llama-3.2-3B-Instruct': { params_billions: 3, quantization: '', context_length: 131072, is_multimodal: false },
  'meta-llama/Llama-3-8B-Instruct': { params_billions: 8, quantization: '', context_length: 8192, is_multimodal: false },
  'Qwen/Qwen2.5-Coder-7B-Instruct': { params_billions: 7, quantization: '', context_length: 32768, is_multimodal: false },
  'Qwen/Qwen2.5-7B-Instruct': { params_billions: 7, quantization: '', context_length: 32768, is_multimodal: false },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-8B': { params_billions: 8, quantization: '', context_length: 16384, is_multimodal: false },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B': { params_billions: 14, quantization: '', context_length: 16384, is_multimodal: false },
  'deepseek-ai/DeepSeek-R1-Distill-Llama-8B': { params_billions: 8, quantization: '', context_length: 16384, is_multimodal: false },
  'mconcat/Qwopus3.6-27B-v2-AWQ-4bit': { params_billions: 27, quantization: 'awq', context_length: 32768, is_multimodal: false },
}

const POPULAR_SUGGESTIONS = Object.keys(SUGGESTION_DETAILS)

export default function ServerConfigPanel() {
  const {
    config,
    advanced,
    status,
    loading,
    localModels,
    setConfig,
    setAdvanced,
    startServer,
    stopServer,
    restartServer,
    selectLocalModel,
    argsRegistry,
    fetchArgsRegistry
  } = useServerStore()

  const [isOpen, setIsOpen] = useState(false)
  const [isSmartFitting, setIsSmartFitting] = useState(false)

  useEffect(() => {
    if (!argsRegistry || argsRegistry.length === 0) {
      fetchArgsRegistry()
    }
  }, [argsRegistry, fetchArgsRegistry])

  const filteredLocal = localModels.filter(m => 
    m.repo_id.toLowerCase().includes(config.model_path.toLowerCase()) ||
    m.model_name.toLowerCase().includes(config.model_path.toLowerCase())
  )

  const filteredPopular = POPULAR_SUGGESTIONS.filter(repoId => 
    repoId.toLowerCase().includes(config.model_path.toLowerCase()) &&
    !localModels.some(m => m.repo_id === repoId)
  )

  const handleStart = async () => {
    try {
      await startServer()
    } catch (e) {
      console.error(e)
    }
  }

  const handleSmartFit = async () => {
    if (!config.model_path) return;
    setIsSmartFitting(true);
    try {
      const matchLocal = localModels.find(m => m.repo_id === config.model_path);
      const matchPopular = SUGGESTION_DETAILS[config.model_path];
      
      let params = 0;
      if (matchLocal?.params_billions) params = matchLocal.params_billions;
      else if (matchPopular?.params_billions) params = matchPopular.params_billions;
      else params = 7; // default assumption
      
      const payload = {
        params_billions: params,
        quantization: config.quantization,
        context_length: config.context_length || 4096,
        dtype: config.dtype,
        cpu_offload_gb: advanced.cpu_offload_gb,
        tensor_parallel_size: config.tensor_parallel_size,
        mem_fraction_static: advanced.mem_fraction_static,
      };
      
      const res = await getVramEstimate(payload);
      const data = res.data;
      
      if (!data.fits && data.total > data.gpu.free_gb) {
        // Try enabling quant
        if (!config.quantization) {
           setConfig(p => ({ ...p, quantization: 'awq', dtype: 'half' }));
        } else {
           // If already quantized, try cpu offload
           const needed = data.total - data.gpu.free_gb;
           setAdvanced(p => ({ ...p, cpu_offload_gb: Math.ceil(needed + 2) }));
        }
        
        // Try reducing mem fraction
        if (advanced.mem_fraction_static > 0.8) {
           setAdvanced(p => ({ ...p, mem_fraction_static: 0.8 }));
        }
      } else if (data.fits) {
        // Optimize
        if (data.gpu.free_gb - data.total > 4 && advanced.mem_fraction_static < 0.9) {
           setAdvanced(p => ({ ...p, mem_fraction_static: 0.9 }));
        }
        if (advanced.cpu_offload_gb > 0 && data.gpu.free_gb - data.total > advanced.cpu_offload_gb + 2) {
           setAdvanced(p => ({ ...p, cpu_offload_gb: 0 }));
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSmartFitting(false);
    }
  }

  const update = (f: string, v: any) => {
    setConfig(prev => ({ ...prev, [f]: v }))
  }

  const updateA = (f: string, v: any) => {
    setAdvanced(prev => ({ ...prev, [f]: v }))
  }

  const buildCommandPreview = () => {
    if (config.backend_type === 'llamacpp') {
      const parts = ['llama-server']
      if (config.host) parts.push(`--host ${config.host}`)
      if (config.port) parts.push(`--port ${config.port}`)
      if (config.model_path) parts.push(`--model "${config.model_path}"`)
      if (config.context_length) parts.push(`--ctx-size ${config.context_length}`)
      if (config.custom_args) parts.push(config.custom_args)
      return parts.join(' \\\n  ')
    } else if (config.backend_type === 'ollama') {
      return `ollama run ${config.model_path || 'model_name'}`
    } else if (config.backend_type === 'vllm') {
      const parts = ['python3 -m vllm.entrypoints.openai.api_server']
      if (config.model_path) parts.push(`--model "${config.model_path}"`)
      if (config.host) parts.push(`--host ${config.host}`)
      if (config.port) parts.push(`--port ${config.port}`)
      if (config.tensor_parallel_size > 1) parts.push(`--tensor-parallel-size ${config.tensor_parallel_size}`)
      if (config.quantization && config.quantization !== 'None') parts.push(`--quantization ${config.quantization}`)
      if (config.dtype && config.dtype !== 'auto') parts.push(`--dtype ${config.dtype}`)
      if (config.context_length) parts.push(`--max-model-len ${config.context_length}`)
      if (advanced.mem_fraction_static !== 0.88) parts.push(`--gpu-memory-utilization ${advanced.mem_fraction_static}`)
      if (config.custom_args) parts.push(config.custom_args)
      return parts.join(' \\\n  ')
    } else {
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
      
      if (advanced.mem_fraction_static !== 0.88) parts.push(`--mem-fraction-static ${advanced.mem_fraction_static}`)
      if (advanced.cpu_offload_gb > 0) parts.push(`--cpu-offload-gb ${advanced.cpu_offload_gb}`)
      if (advanced.speculative_algorithm) parts.push(`--speculative-algorithm ${advanced.speculative_algorithm}`)
      if (advanced.kv_cache_dtype) parts.push(`--kv-cache-dtype ${advanced.kv_cache_dtype}`)
      parts.push('--enable-metrics')
      if (config.custom_args) parts.push(config.custom_args)
      return parts.join(' \\\n  ')
    }
  }


  const renderTooltipLabel = (label: string, help: string) => (
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="text-xs font-semibold text-text-muted">{label}</label>
      {help && (
        <Tooltip content={<div className="max-w-[250px] whitespace-normal break-words leading-tight">{help}</div>} position="top">
          <Info className="h-3 w-3 text-text-muted/60 hover:text-primary cursor-help" />
        </Tooltip>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-text text-sm flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" /> Model Path & Network Settings
        </h3>
        
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              {renderTooltipLabel("Backend Engine", "Select the inference engine to run the model. SGLang (GPU only), vLLM (GPU only), llama.cpp (CPU/GPU GGUF), or Ollama.")}
              <Select 
                options={[
                  { value: 'sglang', label: 'SGLang', desc: 'High-throughput engine (GPU only)' },
                  { value: 'vllm', label: 'vLLM', desc: 'Industry standard serving (GPU only)' },
                  { value: 'llamacpp', label: 'llama.cpp', desc: 'Lightweight runner (CPU/GPU, GGUF)' },
                  { value: 'ollama', label: 'Ollama', desc: 'Ollama local runner' },
                ]}
                value={config.backend_type}
                onChange={v => update('backend_type', v)}
              />
            </div>
            <div className="relative">
              {renderTooltipLabel("Model Path", "HuggingFace repo (e.g. meta-llama/Llama-3-8B-Instruct) or local directory path.")}
              <div className="relative">
                <Input 
                  value={config.model_path} 
                  onFocus={() => setIsOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsOpen(false), 200);
                  }}
                  onChange={e => {
                    const val = e.target.value;
                    update('model_path', val);
                    const matched = localModels.find(m => m.repo_id === val);
                    if (matched) {
                      selectLocalModel(matched);
                    }
                  }} 
                  placeholder="e.g. meta-llama/Llama-3.2-3B-Instruct" 
                  className="h-9 font-mono text-xs pr-8"
                />
                <button
                  type="button"
                  onClick={() => setIsOpen(prev => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer transition-colors"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {isOpen && (filteredLocal.length > 0 || filteredPopular.length > 0) && (
                <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-surface border border-border rounded-lg shadow-lg z-50 divide-y divide-border animate-in fade-in slide-in-from-top-1 duration-200">
                  {filteredLocal.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-text-muted bg-surface-2/40 uppercase tracking-wider">
                        Local Cache (Downloaded)
                      </div>
                      {filteredLocal.map(m => (
                        <div 
                          key={m.repo_id}
                          className="px-3 py-2 text-xs text-text hover:bg-surface-2 cursor-pointer flex justify-between items-center transition-colors font-mono"
                          onClick={() => {
                            selectLocalModel(m);
                            setIsOpen(false);
                          }}
                        >
                          <span className="truncate mr-2">{m.repo_id}</span>
                          <span className="text-[9px] bg-success/20 text-success px-1.5 py-0.5 rounded font-semibold shrink-0 font-sans">
                            LOCAL ({m.params_billions ? `${m.params_billions}B` : m.size_gb ? `${m.size_gb}GB` : 'cache'})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {filteredPopular.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-text-muted bg-surface-2/40 uppercase tracking-wider">
                        Popular on Hugging Face
                      </div>
                      {filteredPopular.map(repoId => {
                        const details = SUGGESTION_DETAILS[repoId];
                        return (
                          <div 
                            key={repoId}
                            className="px-3 py-2 text-xs text-text hover:bg-surface-2 cursor-pointer flex justify-between items-center transition-colors font-mono"
                            onClick={() => {
                              if (details) {
                                setConfig(prev => ({
                                  ...prev,
                                  model_path: repoId,
                                  quantization: details.quantization,
                                  context_length: details.context_length,
                                  enable_multimodal: details.is_multimodal,
                                  dtype: details.quantization === 'awq' ? 'float16' : 'auto'
                                }));
                              } else {
                                update('model_path', repoId);
                              }
                              setIsOpen(false);
                            }}
                          >
                            <span className="truncate mr-2">{repoId}</span>
                            <span className="text-[9px] bg-primary/25 text-primary px-1.5 py-0.5 rounded font-semibold shrink-0 font-sans">
                              HF HUB ({details?.params_billions ? `${details.params_billions}B` : 'hub'})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              {renderTooltipLabel("Host", "IP address to bind the API server. 0.0.0.0 exposes it to the network.")}
              <Input value={config.host} onChange={e => update('host', e.target.value)} placeholder="127.0.0.1" className="h-9 font-mono text-xs" />
            </div>
            <div>
              {renderTooltipLabel("Port", "Port number for the API server.")}
              <Input type="number" value={config.port} onChange={e => update('port', Number(e.target.value))} placeholder="30000" className="h-9 font-mono text-xs" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex justify-between items-center">
           <h3 className="font-semibold text-text text-sm">Key Resource Allocations</h3>
           <Button variant="outline" size="sm" onClick={handleSmartFit} disabled={isSmartFitting || !config.model_path} className="gap-2 border-primary/30 hover:border-primary text-primary transition-colors text-xs font-semibold shadow-sm hover:shadow">
             <Wand2 className={`h-3 w-3 ${isSmartFitting ? 'animate-pulse' : ''}`} />
             Smart Auto-Fit
           </Button>
        </div>
        
        <Tabs defaultValue="basic">
          <TabsList className="mb-4">
            <TabsTrigger value="basic">Basic Settings</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic">
             <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    {renderTooltipLabel("Quantization", "Model weight compression format. Required if using quantized GGUF or AWQ/GPTQ models.")}
                    <Select 
                      options={QUANT_OPTIONS}
                      value={config.quantization}
                      onChange={v => update('quantization', v)}
                    />
                  </div>
                  <div>
                    {renderTooltipLabel("Data Type (Dtype)", "Precision of weights in memory. fp16 or bf16 are standard.")}
                    <Select 
                      options={DTYPE_OPTIONS}
                      value={config.dtype}
                      onChange={v => update('dtype', v)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {renderTooltipLabel("Context Length", "Maximum sequence length (prompt + completion tokens). Higher values require more KV Cache memory.")}
                    <Input type="number" value={config.context_length} onChange={e => update('context_length', Number(e.target.value))} placeholder="0 = default" className="h-9 font-mono text-xs" />
                  </div>
                  <div>
                    {renderTooltipLabel("Tensor Parallelism (GPUs)", "Number of GPUs to distribute the model across. Must be power of 2 usually.")}
                    <Input type="number" value={config.tensor_parallel_size} onChange={e => update('tensor_parallel_size', Number(e.target.value))} min={1} max={8} className="h-9 font-mono text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="flex items-center gap-2">
                     <Switch checked={config.enable_multimodal} onChange={v => update('enable_multimodal', v)} />
                     {renderTooltipLabel("Enable Multimodal", "Load Vision Tower for image understanding.")}
                  </div>
                  <div className="flex items-center gap-2">
                     <Switch checked={config.trust_remote_code} onChange={v => update('trust_remote_code', v)} />
                     {renderTooltipLabel("Trust Remote Code", "Allow custom code execution. Required by some newer models.")}
                  </div>
                </div>
             </div>
          </TabsContent>
          
          <TabsContent value="advanced">
             <div className="space-y-4 animate-fade-in">
                <div>
                   {renderTooltipLabel("Static Memory Fraction", "GPU Memory dedicated to the KV Cache and model. Decrease this if you encounter Out Of Memory (OOM) errors.")}
                   <Slider 
                     value={advanced.mem_fraction_static}
                     onChange={v => updateA('mem_fraction_static', v)}
                     min={0.1}
                     max={0.95}
                     step={0.01}
                     format={v => v.toFixed(2)}
                   />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {renderTooltipLabel("CPU Offload (GB)", "Offload model weights to system RAM. Slows down generation but prevents GPU OOM for large models.")}
                    <Input type="number" value={advanced.cpu_offload_gb} onChange={e => updateA('cpu_offload_gb', Number(e.target.value))} placeholder="0 = disabled" className="h-9 font-mono text-xs" />
                  </div>
                  <div>
                    {renderTooltipLabel("KV Cache Dtype", "Quantize the KV cache to save memory. FP8 is highly recommended for long contexts.")}
                    <select value={advanced.kv_cache_dtype} onChange={e => updateA('kv_cache_dtype', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border text-xs text-text">
                      <option value="">auto</option>
                      <option value="fp8">FP8 (Highly recommended)</option>
                      <option value="fp16">FP16</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                     <Switch checked={advanced.disable_cuda_graph} onChange={v => updateA('disable_cuda_graph', v)} />
                     {renderTooltipLabel("Disable CUDA Graphs", "Disable CUDA graphs which consume extra VRAM. Check this to save memory at slight speed cost.")}
                  </div>
                  <div>
                    {renderTooltipLabel("Speculative Algorithm", "Accelerate decoding by guessing next tokens. Use EAGLE for huge speedups if you have spare VRAM.")}
                    <select value={advanced.speculative_algorithm} onChange={e => updateA('speculative_algorithm', e.target.value)} className="w-full h-8 px-2 rounded bg-surface-2 border border-border text-xs text-text">
                      <option value="">None</option>
                      <option value="EAGLE">EAGLE</option>
                      <option value="NGRAM">N-gram</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-border space-y-1.5">
                  {renderTooltipLabel("Custom CLI Flags / Extra Arguments", "Raw string appended to the launcher command. Refer to the model engine documentation for specific flags.")}
                  <textarea 
                    value={config.custom_args || ''} 
                    onChange={e => update('custom_args', e.target.value)} 
                    placeholder="e.g. -t 8 --threads-batch 16 -b 3128" 
                    className="w-full h-20 px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs font-mono text-text focus:outline-none focus:border-primary placeholder:text-text-muted/40 resize-y"
                  />
                </div>
             </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-text text-sm">Server Launcher Action</h3>
        <div className="flex gap-3">
          <Button onClick={handleStart} disabled={loading || status.running} className="flex-1 gap-2">
            <Play className="h-4 w-4" /> Deploy & Start {config.backend_type === 'sglang' ? 'SGLang' : config.backend_type === 'vllm' ? 'vLLM' : config.backend_type === 'llamacpp' ? 'llama.cpp' : 'Ollama'}
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
