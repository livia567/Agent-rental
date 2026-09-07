import { ref, computed } from 'vue'
import { formatAgentResult, sanitizeStream } from '../utils/formatAgentResult'

/**
 * Agent 流式结论展示状态机。
 * - agent_chunk 累积原始 JSON 到 rawStream，实时预览时经 sanitizeStream 过滤；
 * - agent_done 用结构化数据渲染出最终结论 finalText，替换预览；
 * - agent_start / agent_retry 重置。
 * 抽成组合式函数，便于脱离组件单独测试事件序列。
 */
export function useAgentStream() {
  const rawStream = ref('')
  const finalText = ref('')

  // 展示内容：完成前用过滤后的流式预览，完成后用结构化结论
  const displayedOutput = computed(() => finalText.value || sanitizeStream(rawStream.value))

  function onAgentStart() {
    rawStream.value = ''
    finalText.value = ''
  }

  function onAgentChunk(content: string) {
    rawStream.value += content
  }

  function onAgentRetry() {
    rawStream.value = ''
    finalText.value = ''
  }

  function onAgentDone(agent: string, data: unknown) {
    finalText.value = formatAgentResult(agent, data)
  }

  return { displayedOutput, onAgentStart, onAgentChunk, onAgentRetry, onAgentDone }
}
