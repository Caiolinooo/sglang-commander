export interface ValidationIssue {
  type: 'error' | 'warning' | 'info'
  field?: string
  message: string
  fix?: string
}

export interface FlagValidation {
  valid: boolean
  issues: ValidationIssue[]
}

const MAMBA_MODELS = ['qwen3', 'qwen2.5', 'mamba', 'jamba']
const MTP_MODELS = ['qwen3', 'qwen2.5']

export function validateConfig(config: {
  model_name: string
  params_billions: number
  quantization: string
  dtype: string
  context_length: number
  tensor_parallel_size: number
  ep_size: number
  pp_size: number
  kv_cache_dtype: string
  mem_fraction_static: number
  cpu_offload_gb: number
  max_running_requests: number
  enable_multimodal: boolean
  trust_remote_code: boolean
  enable_dp_attention: boolean
  disable_cuda_graph: boolean
  speculative_algorithm: string
  speculative_num_steps: number
  speculative_draft_model_path: string
  load_format: string
  tool_call_parser: string
  reasoning_parser: string
  total_vram_gb: number
  free_vram_gb: number
  num_gpus: number
  is_moe: boolean
  architectures: string[]
}): FlagValidation {
  const issues: ValidationIssue[] = []
  const { model_name } = config
  const ml = model_name.toLowerCase()

  // 1. AWQ → recommend awq_marlin
  if (config.quantization.toLowerCase() === 'awq') {
    issues.push({
      type: 'info',
      field: 'quantization',
      message: 'AWQ model detected — use "awq_marlin" for ~2x faster inference',
      fix: 'Set quantization to "awq_marlin"',
    })
  }

  // 2. Speculative decoding + Mamba/radix cache conflict
  if (config.speculative_algorithm) {
    const isMambaModel = MAMBA_MODELS.some(m => ml.includes(m))
    if (isMambaModel) {
      issues.push({
        type: 'warning',
        field: 'speculative_algorithm',
        message: `Speculative decoding (${config.speculative_algorithm}) may conflict with radix cache on ${model_name}. Needs --mamba-scheduler-strategy extra_buffer and SGLANG_ENABLE_SPEC_V2=1`,
        fix: 'Add env var SGLANG_ENABLE_SPEC_V2=1 or disable speculative decoding',
      })
    }
  }

  // 3. CPU offload > model weights (wasteful)
  if (config.cpu_offload_gb > 0) {
    const bpp = config.quantization?.toLowerCase().includes('awq') || config.quantization?.toLowerCase().includes('gptq') || config.quantization?.toLowerCase().includes('int4') ? 0.5
      : config.quantization?.toLowerCase().includes('fp8') || config.quantization?.toLowerCase().includes('int8') ? 1 : 2
    const modelVramEst = config.params_billions * bpp
    const maxUsefulOffload = Math.min(modelVramEst, config.total_vram_gb * 0.9)
    if (config.cpu_offload_gb > maxUsefulOffload) {
      issues.push({
        type: 'warning',
        field: 'cpu_offload_gb',
        message: `CPU offload (${config.cpu_offload_gb}GB) exceeds useful amount (~${maxUsefulOffload.toFixed(0)}GB). Extra offload has no effect.`,
        fix: `Reduce cpu_offload_gb to ${Math.ceil(maxUsefulOffload)}`,
      })
    }
    // CPU offload + CUDA graphs = crash (offloader tied-weights bug)
    if (!config.disable_cuda_graph) {
      issues.push({
        type: 'warning',
        field: 'cpu_offload_gb',
        message: `CPU offload (${config.cpu_offload_gb}GB) is incompatible with CUDA graphs — the offloader crashes on tied weights. CUDA graphs will be auto-disabled.`,
        fix: 'CUDA graphs auto-disabled when CPU offload is active',
      })
    }
  }

  // 4. enable_dp_attention without ep_size > 1
  if (config.enable_dp_attention && config.ep_size <= 1) {
    if (config.is_moe) {
      issues.push({
        type: 'warning',
        field: 'enable_dp_attention',
        message: 'Data parallel attention (--enable-dp-attention) requires expert parallelism (--ep-size > 1) for MoE models',
        fix: 'Set EP size ≥ 2 or disable DP attention',
      })
    }
  }

  // 5. Context length sanity
  if (config.context_length > 65536) {
    issues.push({
      type: 'warning',
      field: 'context_length',
      message: `Context length ${config.context_length} may exceed model training window. VRAM will be very high.`,
      fix: 'Reduce context_length or enable FP8 KV cache',
    })
  }

  // 6. mem_fraction_static too high
  if (config.mem_fraction_static > 0.95) {
    issues.push({
      type: 'warning',
      field: 'mem_fraction_static',
      message: `mem_fraction_static ${config.mem_fraction_static} leaves almost no headroom — risk of OOM`,
      fix: 'Reduce to 0.85-0.90',
    })
  } else if (config.mem_fraction_static < 0.5) {
    issues.push({
      type: 'info',
      field: 'mem_fraction_static',
      message: `mem_fraction_static ${config.mem_fraction_static} is very low — KV cache capacity severely limited`,
      fix: 'Increase to 0.75-0.88 for better throughput',
    })
  }

  // 7. TP/PP > available GPUs
  if (config.tensor_parallel_size > config.num_gpus) {
    issues.push({
      type: 'error',
      field: 'tensor_parallel_size',
      message: `TP ${config.tensor_parallel_size} exceeds available GPUs (${config.num_gpus})`,
      fix: `Reduce TP to ${config.num_gpus}`,
    })
  }
  if (config.pp_size > config.num_gpus) {
    issues.push({
      type: 'error',
      field: 'pp_size',
      message: `PP ${config.pp_size} exceeds available GPUs (${config.num_gpus})`,
      fix: `Reduce PP to ${config.num_gpus}`,
    })
  }
  if (config.tensor_parallel_size * config.pp_size > config.num_gpus) {
    issues.push({
      type: 'error',
      field: 'tensor_parallel_size',
      message: `TP (${config.tensor_parallel_size}) × PP (${config.pp_size}) = ${config.tensor_parallel_size * config.pp_size} > ${config.num_gpus} GPUs`,
      fix: `Reduce TP × PP to ≤ ${config.num_gpus}`,
    })
  }

  // 8. MTP head without speculative algorithm
  if (MTP_MODELS.some(m => ml.includes(m)) && !config.speculative_algorithm) {
    issues.push({
      type: 'info',
      field: 'speculative_algorithm',
      message: `${model_name} may have MTP heads — enable EAGLE speculative decoding for faster generation`,
      fix: 'Set speculative_algorithm to "EAGLE"',
    })
  }

  // 9. FP8 KV cache + large context
  if (config.kv_cache_dtype && config.kv_cache_dtype.includes('fp8') && config.context_length > 32000) {
    issues.push({
      type: 'info',
      field: 'kv_cache_dtype',
      message: `FP8 KV cache with ${config.context_length} context gives ~2x more tokens vs BF16`,
    })
  }

  // 10. Multimodal + no --enable-multimodal
  if (config.enable_multimodal && !ml.includes('vision') && !ml.includes('vlm') && !ml.includes('llava') && !ml.includes('qwen2') && !ml.includes('gemini')) {
    issues.push({
      type: 'info',
      field: 'enable_multimodal',
      message: 'Multimodal enabled — ensure model supports image inputs',
    })
  }

  // 11. Load format
  if (config.load_format === 'gguf' && !ml.includes('gguf')) {
    issues.push({
      type: 'info',
      field: 'load_format',
      message: 'GGUF load format set — ensure model files are in GGUF format',
    })
  }

  // 12. Disable CUDA graph with speculative (may conflict)
  if (config.disable_cuda_graph && config.speculative_algorithm) {
    issues.push({
      type: 'warning',
      field: 'disable_cuda_graph',
      message: 'CUDA graphs disabled but speculative decoding enabled — may impact performance',
      fix: 'Enable CUDA graphs or disable speculative decoding',
    })
  }

  // 13. Tool call parser mismatch
  const toolModelMap: Record<string, string[]> = {
    llama3: ['llama', 'llama3'],
    qwen: ['qwen', 'qwen2', 'qwen3'],
    mistral: ['mistral'],
    deepseek: ['deepseek'],
    qwen3_coder: ['qwen3'],
  }
  if (config.tool_call_parser) {
    const expected = Object.entries(toolModelMap).find(([, models]) =>
      models.some(m => ml.includes(m))
    )?.[0]
    if (expected && config.tool_call_parser !== expected) {
      issues.push({
        type: 'warning',
        field: 'tool_call_parser',
        message: `tool_call_parser "${config.tool_call_parser}" may not match model "${model_name}". Expected "${expected}"`,
        fix: `Set tool_call_parser to "${expected}"`,
      })
    }
  }

  return { valid: issues.filter(i => i.type === 'error').length === 0, issues }
}
