export interface VRAMInput {
  paramsBillions: number
  quantization: string
  dtype: string
  contextLength: number
  memFractionStatic: number
  cpuOffloadGb: number
  tensorParallelSize: number
  epSize: number
  kvCacheDtype: string
  maxRunningRequests: number
  totalVramGb: number
  freeVramGb: number
  numLayers?: number
  numKvHeads?: number
  headDim?: number
  enableMultimodal?: boolean
  speculativeAlgorithm?: string
  speculativeDraftModelPath?: string
}

export interface VRAMBreakdown {
  modelWeights: number
  kvCache: number
  activations: number
  frameworkOverhead: number
  visionTower: number
  speculative: number
  cpuOffloaded: number
  total: number
  fits: boolean
  freeAfterModel: number
  freeAfterAll: number
  freeVramGb: number
  totalVramGb: number
  kvCacheDtypeLabel: string
  effectiveContext: number
  warnings: string[]
}

function dtypeBytes(quantization: string, dtype: string): number {
  const q = quantization.toLowerCase()
  if (['awq', 'gptq', 'int4'].some(x => q.includes(x))) return 0.5
  if (q.includes('fp8') || q.includes('int8')) return 1
  if (q.includes('q2') || q.includes('iq2')) return 0.25
  if (q.includes('q3') || q.includes('iq3')) return 0.375
  if (q.includes('q4') || q.includes('iq4')) return 0.5
  if (q.includes('q5') || q.includes('iq5')) return 0.625
  if (q.includes('q6')) return 0.75
  if (q.includes('q8')) return 1
  const d = dtype.toLowerCase()
  if (d === 'float32' || d === 'fp32') return 4
  if (d === 'bfloat16' || d === 'bf16' || d === 'half' || d === 'float16' || d === 'fp16') return 2
  return 2
}

function kvCacheBytes(kvCacheDtype: string): number {
  const k = kvCacheDtype.toLowerCase()
  if (k.includes('fp4')) return 0.5
  if (k.includes('fp8')) return 1
  if (k === 'auto' || k === '' || k.includes('bf16') || k.includes('fp16')) return 2
  return 2
}

export function calculateVRAM(input: VRAMInput): VRAMBreakdown {
  const {
    paramsBillions, quantization, dtype, contextLength, memFractionStatic,
    cpuOffloadGb, tensorParallelSize, epSize, kvCacheDtype,
    maxRunningRequests, totalVramGb, freeVramGb,
    enableMultimodal, speculativeAlgorithm, speculativeDraftModelPath
  } = input

  const warnings: string[] = []
  const bytesPerParam = dtypeBytes(quantization, dtype)
  const kvBytes = kvCacheBytes(kvCacheDtype)

  // 1. Model weights
  const rawModelGb = paramsBillions * bytesPerParam
  const tpFactor = Math.max(1, tensorParallelSize)
  const epFactor = Math.max(1, epSize)
  const modelAfterTp = rawModelGb / tpFactor / epFactor
  const cpuOffloaded = Math.min(cpuOffloadGb, modelAfterTp)
  const modelWeights = Math.max(0, modelAfterTp - cpuOffloaded)

  // 2. KV Cache
  // Base: for 7B @ 4K context @ fp16 = ~2GB KV cache
  // Scale by params, context, kv dtype, TP
  const kvBaseGb = 2.0
  const kvContextScale = Math.max(1, contextLength) / 4096
  const kvParamScale = Math.max(1, paramsBillions) / 7
  const kvDtypeScale = kvBytes / 2
  let kvCache = kvBaseGb * kvContextScale * kvParamScale * kvDtypeScale / tpFactor

  // KV cache is also limited by mem_fraction_static
  const maxKvFromMem = totalVramGb * memFractionStatic
  if (kvCache > maxKvFromMem) {
    warnings.push(`KV cache (${kvCache.toFixed(1)}GB) limited by mem_fraction_static (${maxKvFromMem.toFixed(1)}GB)`)
    kvCache = maxKvFromMem
  }

  // 3. Activations (rough: ~0.5GB per running request for 7B, scale by params/TP)
  const activationBase = 0.5 * Math.max(1, maxRunningRequests)
  const activations = activationBase * (paramsBillions / 7) / tpFactor

  // 4. Vision Tower (Multimodal)
  const visionTower = enableMultimodal ? 1.5 : 0.0

  // 5. Speculative Decoding
  let speculative = 0.0
  if (speculativeAlgorithm) {
    if (speculativeDraftModelPath) {
      let draftParams = 1.0
      const match = speculativeDraftModelPath.match(/[-_/](\d+(\.\d+)?)[bB]/)
      if (match) {
        draftParams = parseFloat(match[1])
      }
      const draftRawGb = draftParams * bytesPerParam
      speculative = draftRawGb / tpFactor
    } else if (speculativeAlgorithm.toUpperCase() === 'EAGLE') {
      speculative = Math.max(1.0, modelWeights * 0.15)
    } else if (speculativeAlgorithm.toUpperCase() === 'NGRAM') {
      speculative = 0.2
    }
  }

  // 6. Framework overhead
  const frameworkOverhead = 1.5

  // Total
  const total = modelWeights + kvCache + activations + frameworkOverhead + visionTower + speculative
  const freeAfterModel = freeVramGb - modelWeights
  const freeAfterAll = totalVramGb - total

  const fits = total <= freeVramGb * 0.95

  // Generate warnings
  if (total > totalVramGb * 0.9) {
    warnings.push(`Total VRAM (${total.toFixed(1)}GB) > 90% of GPU (${totalVramGb}GB)`)
  }
  if (modelWeights > freeVramGb) {
    warnings.push(`Model weights (${modelWeights.toFixed(1)}GB) exceed free VRAM (${freeVramGb}GB)`)
  }
  if (cpuOffloaded > 0) {
    warnings.push(`${cpuOffloaded.toFixed(1)}GB offloaded to CPU RAM (slower)`)
  }

  const kvCacheDtypeLabels: Record<string, string> = {
    auto: 'auto (fp16)', fp8_e4m3: 'FP8 E4M3', fp8_e5m2: 'FP8 E5M2',
    fp4_e2m1: 'FP4 E2M1', bf16: 'BF16', fp16: 'FP16',
  }

  return {
    modelWeights: Math.round(modelWeights * 100) / 100,
    kvCache: Math.round(kvCache * 100) / 100,
    activations: Math.round(activations * 100) / 100,
    frameworkOverhead,
    visionTower: Math.round(visionTower * 100) / 100,
    speculative: Math.round(speculative * 100) / 100,
    cpuOffloaded: Math.round(cpuOffloaded * 100) / 100,
    total: Math.round(total * 100) / 100,
    fits,
    freeAfterModel: Math.round(freeAfterModel * 100) / 100,
    freeAfterAll: Math.round(freeAfterAll * 100) / 100,
    freeVramGb,
    totalVramGb,
    kvCacheDtypeLabel: kvCacheDtypeLabels[kvCacheDtype.toLowerCase()] || kvCacheDtype || 'auto (fp16)',
    effectiveContext: contextLength,
    warnings,
  }
}
