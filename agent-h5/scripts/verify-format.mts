// 功能验证脚本：验证 formatAgentResult 对四种 agent 的结构化数据输出为可读中文文本，不含任何 JSON 语法。
// 运行：npx tsx scripts/verify-format.mts（在 agent-h5 目录，或使用 agent-server 的 tsx）
import { formatAgentResult, sanitizeStream } from '../src/utils/formatAgentResult'

let failed = 0

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ' —— ' + detail : ''}`)
  }
}

// 输出中不得出现任何 JSON 语法字符 / 键值对模式
function assertNoJson(name: string, out: string) {
  check(`${name}: 无 { } 花括号`, !/[{}]/.test(out), out)
  check(`${name}: 无 [ ] 方括号`, !/[\[\]]/.test(out), out)
  check(`${name}: 无双引号`, !/"/.test(out), out)
  check(`${name}: 无 "key:" JSON 键`, !/[a-z_][a-z0-9_]*\s*:/.test(out), out)
}

console.log('1) clause_splitter')
{
  const out = formatAgentResult('clause_splitter', {
    clauses: [
      { id: '1', originalText: '每月租金为人民币3000元整', clauseType: 'rent' },
      { id: '2', originalText: '押金为两个月租金', clauseType: 'deposit' },
    ],
  })
  assertNoJson('clause_splitter', out)
  check('clause_splitter: 含条款序号', out.includes('【条款1】') && out.includes('【条款2】'), out)
  check('clause_splitter: 含类型中文标签', out.includes('租金条款') && out.includes('押金条款'), out)
  check('clause_splitter: 含原文', out.includes('每月租金为人民币3000元整'), out)
}

console.log('2) risk_analyzer')
{
  const out = formatAgentResult('risk_analyzer', {
    riskAnnotatedClauses: [
      { clause: { id: '1', originalText: 'x', clauseType: 'rent' }, riskLevel: 'high', suggestion: '建议明确押金退还条件' },
      { clause: { id: '2', originalText: 'x', clauseType: 'deposit' }, riskLevel: 'low', suggestion: '该条款风险较低' },
    ],
  })
  assertNoJson('risk_analyzer', out)
  check('risk_analyzer: 含风险等级中文', out.includes('高风险') && out.includes('低风险'), out)
  check('risk_analyzer: 含建议文案', out.includes('建议明确押金退还条件'), out)
}

console.log('3) negotiation_advisor')
{
  const out = formatAgentResult('negotiation_advisor', {
    negotiationTips: [
      { clauseId: '1', clauseTitle: '押金条款', riskLevel: 'high', script: '押金这块能否明确退还条件？' },
    ],
  })
  assertNoJson('negotiation_advisor', out)
  check('negotiation_advisor: 含条款标题', out.includes('押金条款'), out)
  check('negotiation_advisor: 含话术', out.includes('押金这块能否明确退还条件？'), out)
}

console.log('4) final_reviewer')
{
  const out = formatAgentResult('final_reviewer', {
    finalReport: {
      overallScore: 78,
      verdict: 'cautious',
      verdictReason: '整体规范，但押金条款需谈判',
      summary: '合同整体可接受，建议谨慎签约。',
      highlights: ['租金合理', '租期明确'],
      riskSummary: { high: 1, medium: 1, low: 3 },
    },
  })
  assertNoJson('final_reviewer', out)
  check('final_reviewer: 含结论标签', out.includes('谨慎签约'), out)
  check('final_reviewer: 含总结', out.includes('建议谨慎签约'), out)
  check('final_reviewer: 含亮点', out.includes('亮点：租金合理、租期明确'), out)
  check('final_reviewer: 不显示 overallScore 数字', !out.includes('overallScore'), out)
}

console.log('5) 边界情况')
{
  check('未知 agent 返回空串', formatAgentResult('unknown_agent', { a: 1 }) === '', formatAgentResult('unknown_agent', { a: 1 }))
  check('null 返回空串', formatAgentResult('final_reviewer', null) === '')
  check('字符串（旧版原始 JSON 流）返回空串，不再展示原始 JSON',
    formatAgentResult('risk_analyzer', '{"clauseId":"1","riskLevel":"high","suggestion":"x"}') === '')
}

console.log('6) sanitizeStream 流式过滤')
{
  // 单条风险 JSON
  const single = sanitizeStream('{"clauseId":"1","riskLevel":"high","suggestion":"建议明确押金退还条件"}')
  assertNoJson('流式-单条 risk', single)
  check('流式-单条 risk: 含建议文案', single.includes('建议明确押金退还条件'), single)
  check('流式-单条 risk: 不含 high / 1', !single.includes('high') && !single.includes('1'), single)

  // 并行拼接的多个 risk JSON（旧版泄漏场景）
  const concat = sanitizeStream('{"clauseId":"1","riskLevel":"high","suggestion":"建议明确押金"}{"clauseId":"2","riskLevel":"low","suggestion":"该条款风险低"}')
  assertNoJson('流式-拼接 risk', concat)
  check('流式-拼接 risk: 两条建议都在', concat.includes('建议明确押金') && concat.includes('该条款风险低'), concat)
  check('流式-拼接 risk: 不含 high/low/1/2', !concat.includes('high') && !concat.includes('low') && !concat.includes('1') && !concat.includes('2'), concat)

  // 终审报告 JSON（含数字、枚举、数组、嵌套对象）
  const final = sanitizeStream('{"overallScore":85,"verdict":"cautious","verdictReason":"整体规范","summary":"可接受","highlights":["租金合理","租期明确"],"riskSummary":{"high":1,"medium":2,"low":5}}')
  assertNoJson('流式-终审', final)
  check('流式-终审: 含 summary 与亮点', final.includes('可接受') && final.includes('租金合理') && final.includes('租期明确'), final)
  check('流式-终审: 不含 85 / cautious / 1 / 2 / 5', !final.includes('85') && !final.includes('cautious') && !final.includes('1') && !final.includes('2') && !final.includes('5'), final)

  // 保留中文内嵌数字（租金金额）
  const num = sanitizeStream('{"originalText":"每月租金为人民币3000元整"}')
  check('流式: 保留中文内嵌数字"3000元"', num.includes('3000元'), num)

  // 未写完的键片段不泄漏英文
  const partial = sanitizeStream('{"clauseId":"1","suggesti')
  check('流式: 未写完键片段被过滤', !partial.includes('suggesti') && !partial.includes('suggest'), partial)
}

if (failed > 0) {
  console.error(`\n共 ${failed} 项断言失败`)
  process.exit(1)
} else {
  console.log('\n全部断言通过：四种 agent 结论均为可读中文，无 JSON 泄漏')
}
