// 功能验证脚本：按 handleSSEEvent 的事件序列驱动 useAgentStream 状态机，
// 验证 agent_start → agent_chunk → agent_done 的流式累积与"预览→结论"切换。
// 运行：npx tsx scripts/verify-stream.mts
import { useAgentStream } from '../src/composables/useAgentStream'

let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failed++; console.error(`  ✗ ${name}${detail ? ' —— ' + detail : ''}`) }
}

const noJson = (out: string) => !/[{}[\]]/.test(out) && !/"/.test(out) && !/[a-z_][a-z0-9_]*\s*:/.test(out)

const s = useAgentStream()

console.log('1) 初始与 agent_start 重置')
check('初始 displayedOutput 为空', s.displayedOutput.value === '')
s.onAgentStart()
check('agent_start 后为空', s.displayedOutput.value === '')

console.log('2) agent_chunk 流式累积（部分 JSON → 完整）')
s.onAgentChunk('{"clauseId":"1","riskLevel":"high","suggestion":"建议明')
const mid1 = s.displayedOutput.value
check('部分 JSON：非空且无 JSON 结构', mid1 !== '' && noJson(mid1), mid1)
check('部分 JSON：含已到达的部分中文', mid1.includes('建议明'), mid1)
check('部分 JSON：未写完键片段/枚举被过滤', !/suggestion|high/.test(mid1) && !mid1.includes('1'), mid1)

s.onAgentChunk('确押金退还条件"}')
const mid2 = s.displayedOutput.value
check('完整后：含完整建议文案', mid2.includes('建议明确押金退还条件'), mid2)
check('完整后：无 JSON 结构/枚举/数字', noJson(mid2) && !/high/.test(mid2) && !mid2.includes('1'), mid2)

console.log('3) agent_done 切换到结构化结论（预览→结论）')
s.onAgentDone('risk_analyzer', {
  riskAnnotatedClauses: [
    { clause: { id: '1', originalText: 'x', clauseType: 'rent' }, riskLevel: 'high', suggestion: '建议明确押金退还条件' },
  ],
})
const done = s.displayedOutput.value
check('agent_done 后为结构化结论（含风险等级中文）', done.includes('高风险'), done)
check('agent_done 后无 JSON', noJson(done), done)

console.log('4) agent_retry 重置')
s.onAgentRetry()
check('agent_retry 后为空', s.displayedOutput.value === '')

console.log('5) 并行拼接的 agent_chunk（旧版 JSON 泄漏场景）')
s.onAgentStart()
s.onAgentChunk('{"clauseId":"1","riskLevel":"high","suggestion":"建议明确押金退还条件"}{"clauseId":"2","riskLevel":"low","suggestion":"该条款风险较低"}')
const concat = s.displayedOutput.value
check('拼接：两条建议都在', concat.includes('建议明确押金退还条件') && concat.includes('该条款风险较低'), concat)
check('拼接：无 JSON / 枚举 / 数字', noJson(concat) && !/high|low/.test(concat) && !/[12]/.test(concat), concat)

if (failed > 0) {
  console.error(`\n共 ${failed} 项断言失败`)
  process.exit(1)
} else {
  console.log('\n全部断言通过：流式累积 → 过滤预览 → agent_done 结论切换 均正常')
}
