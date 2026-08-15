import { writeFile } from 'node:fs/promises';
import { createRelay } from '../network/relay/server.js';
import { createIdentity } from '../core/identity/index.js';
import { contextQueryHash, renderContextSelection, retrieveContextBlocks } from '../core/context/index.js';
import { createSemanticContextRouterV2, CONTEXT_RETRIEVAL_ALGORITHM_V2 } from '../core/context/semantic-router-v2.js';
import { TruynNode } from '../node/client.js';
import { SemanticTruynNode } from '../node/semantic-client.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';
import { createAzureFoundryProvider } from '../adapters/providers/azure-foundry.js';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';
import { createVertexEmbeddingClient } from '../adapters/providers/vertex-embedding.js';

const outputPath = process.env.SEMANTIC_V2_OUTPUT || 'semantic-retrieval-v2.json';
const corpusSize = Number(process.env.SEMANTIC_V2_CORPUS_BLOCKS || 600);
const retrievalCaseCount = Number(process.env.SEMANTIC_V2_RETRIEVAL_CASES || 360);
const liveCaseCount = Number(process.env.SEMANTIC_V2_LIVE_CASES || 6);
const pacingMs = Number(process.env.SEMANTIC_V2_PACING_MS || 30_000);
const maxRetries = Number(process.env.SEMANTIC_V2_RATE_LIMIT_RETRIES || 8);
const gcpProjectId = process.env.GCP_PROJECT_ID;
const proxyEndpoint = process.env.VERTEX_API_ENDPOINT;
const proxyToken = process.env.GCP_ACCESS_TOKEN;
const embeddingLocation = process.env.VERTEX_EMBEDDING_LOCATION || 'us-central1';
const embeddingModel = process.env.VERTEX_EMBEDDING_MODEL || 'text-multilingual-embedding-002';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const geminiLocation = process.env.GOOGLE_CLOUD_LOCATION || 'global';

const required = {
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
  AZURE_FOUNDRY_ENDPOINT: process.env.AZURE_FOUNDRY_ENDPOINT,
  AZURE_FOUNDRY_API_KEY: process.env.AZURE_FOUNDRY_API_KEY,
  AZURE_FOUNDRY_GROK: process.env.AZURE_FOUNDRY_GROK,
  AZURE_FOUNDRY_DEEPSEEK: process.env.AZURE_FOUNDRY_DEEPSEEK,
  AZURE_FOUNDRY_LLAMA: process.env.AZURE_FOUNDRY_LLAMA,
  AZURE_FOUNDRY_MISTRAL: process.env.AZURE_FOUNDRY_MISTRAL,
  AZURE_FOUNDRY_KIMI: process.env.AZURE_FOUNDRY_KIMI,
  GCP_PROJECT_ID: gcpProjectId,
  VERTEX_API_ENDPOINT: proxyEndpoint,
  GCP_ACCESS_TOKEN: proxyToken
};
for (const [name, value] of Object.entries(required)) if (!value) throw new Error(`${name} is required`);
if (!Number.isInteger(corpusSize) || corpusSize < 500 || corpusSize > 1000 || corpusSize % 2 !== 0) throw new Error('SEMANTIC_V2_CORPUS_BLOCKS must be an even integer from 500 to 1000');
if (!Number.isInteger(retrievalCaseCount) || retrievalCaseCount < 300 || retrievalCaseCount > corpusSize) throw new Error('SEMANTIC_V2_RETRIEVAL_CASES must be between 300 and corpus size');
if (!Number.isInteger(liveCaseCount) || liveCaseCount < 3 || liveCaseCount > 9) throw new Error('SEMANTIC_V2_LIVE_CASES must be 3..9');

const gate = Object.freeze({
  retrievalAccuracyPercentMin: 99,
  perLanguageAccuracyPercentMin: 99,
  perCategoryAccuracyPercentMin: 99,
  answerAccuracyPercentMin: 99,
  inputTokenReductionPercentMin: 90,
  comparablePairCostReductionPercentMin: 90,
  provenancePassPercentMin: 100,
  noBlockIdPassPercentMin: 100,
  minimalContextPassPercentMin: 100,
  actorStageSuccessPercentMin: 99
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bytes = (value) => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const round = (value, digits = 6) => value == null ? null : Number(value.toFixed(digits));
const percent = (part, total) => total > 0 ? round((part / total) * 100, 3) : null;
const reductionPercent = (baseline, candidate) => baseline > 0 ? round(((baseline - candidate) / baseline) * 100, 3) : null;
const sum = (items, getter) => items.reduce((total, item) => total + getter(item), 0);
const mean = (items, getter) => sum(items, getter) / Math.max(1, items.length);

function isRateLimit(error) {
  return error?.status === 429 || /rate limit|too many requests|resource exhausted|429/i.test(error?.message || '');
}
const retryEvents = [];
async function withRetry(label, fn) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await fn(); }
    catch (error) {
      if (!isRateLimit(error) || attempt >= maxRetries) throw error;
      const delayMs = Math.max(pacingMs, 5_000) * Math.min(4, attempt + 1);
      retryEvents.push({ label, retry: attempt + 1, delayMs, error: error.message });
      await sleep(delayMs);
    }
  }
}

const domains = [
  { en:'aircraft maintenance operations', enq:'airframe upkeep workflow', zh:'航空器维护运行', zhq:'飞机保养流程', tr:'uçak bakım operasyonları', trq:'hava aracı servis süreci' },
  { en:'cross-border payment clearing', enq:'international funds settlement', zh:'跨境支付清算', zhq:'国际资金结算', tr:'sınır ötesi ödeme takası', trq:'uluslararası fon mutabakatı' },
  { en:'cold-chain logistics', enq:'temperature-controlled delivery', zh:'冷链物流', zhq:'温控配送', tr:'soğuk zincir lojistiği', trq:'ısı kontrollü teslimat' },
  { en:'oncology laboratory operations', enq:'cancer diagnostics lab workflow', zh:'肿瘤实验室运行', zhq:'癌症诊断实验流程', tr:'onkoloji laboratuvar operasyonları', trq:'kanser tanı laboratuvarı süreci' },
  { en:'wind-farm operations', enq:'wind turbine field management', zh:'风电场运行', zhq:'风力涡轮机现场管理', tr:'rüzgar çiftliği operasyonları', trq:'rüzgar türbini saha yönetimi' },
  { en:'newsroom publishing', enq:'editorial release workflow', zh:'新闻编辑发布', zhq:'编辑内容上线流程', tr:'haber merkezi yayıncılığı', trq:'editoryal yayın süreci' },
  { en:'digital identity security', enq:'account identity protection', zh:'数字身份安全', zhq:'账户身份保护', tr:'dijital kimlik güvenliği', trq:'hesap kimliği koruması' },
  { en:'online education delivery', enq:'remote learning service', zh:'在线教育交付', zhq:'远程学习服务', tr:'çevrimiçi eğitim sunumu', trq:'uzaktan öğrenme hizmeti' },
  { en:'crop irrigation management', enq:'farm water scheduling', zh:'作物灌溉管理', zhq:'农田用水调度', tr:'ürün sulama yönetimi', trq:'tarla su planlaması' },
  { en:'wildfire monitoring', enq:'forest fire surveillance', zh:'野火监测', zhq:'森林火灾监控', tr:'orman yangını izleme', trq:'yangın gözetim süreci' },
  { en:'semiconductor manufacturing', enq:'chip fabrication workflow', zh:'半导体制造', zhq:'芯片生产流程', tr:'yarı iletken üretimi', trq:'çip imalat süreci' },
  { en:'mobile network operations', enq:'cellular service management', zh:'移动网络运行', zhq:'蜂窝通信服务管理', tr:'mobil ağ operasyonları', trq:'hücresel hizmet yönetimi' },
  { en:'maritime navigation', enq:'ship route control', zh:'海上导航', zhq:'船舶航线控制', tr:'deniz seyrüseferi', trq:'gemi rota kontrolü' },
  { en:'municipal water treatment', enq:'city drinking-water processing', zh:'市政水处理', zhq:'城市饮用水净化', tr:'belediye su arıtımı', trq:'şehir içme suyu işleme' },
  { en:'satellite ground control', enq:'spacecraft ground-station operations', zh:'卫星地面控制', zhq:'航天器地面站运行', tr:'uydu yer kontrolü', trq:'uzay aracı yer istasyonu operasyonu' },
  { en:'insurance claims processing', enq:'policy loss assessment workflow', zh:'保险理赔处理', zhq:'保单损失评估流程', tr:'sigorta hasar işlemleri', trq:'poliçe zarar değerlendirme süreci' },
  { en:'retail inventory management', enq:'store stock control', zh:'零售库存管理', zhq:'门店存货控制', tr:'perakende envanter yönetimi', trq:'mağaza stok kontrolü' },
  { en:'railway signaling', enq:'train movement control', zh:'铁路信号控制', zhq:'列车运行控制', tr:'demiryolu sinyalizasyonu', trq:'tren hareket kontrolü' },
  { en:'carbon accounting', enq:'greenhouse-gas ledger management', zh:'碳核算', zhq:'温室气体账本管理', tr:'karbon muhasebesi', trq:'sera gazı kayıt yönetimi' },
  { en:'hospital pharmacy operations', enq:'clinical medication dispensing', zh:'医院药房运行', zhq:'临床药品发放', tr:'hastane eczane operasyonları', trq:'klinik ilaç dağıtımı' }
];

const operations = [
  { en:'isolate an operational anomaly', enq:'contain an abnormal condition', zh:'隔离运行异常', zhq:'控制异常状态', tr:'operasyonel bir anomaliyi izole etmek', trq:'olağandışı durumu sınırlamak' },
  { en:'reconcile conflicting records', enq:'harmonize mismatched entries', zh:'核对冲突记录', zhq:'统一不一致条目', tr:'çelişen kayıtları uzlaştırmak', trq:'uyuşmayan girdileri eşleştirmek' },
  { en:'schedule preventive maintenance', enq:'plan proactive servicing', zh:'安排预防性维护', zhq:'规划主动保养', tr:'önleyici bakımı planlamak', trq:'proaktif servisi düzenlemek' },
  { en:'forecast near-term demand', enq:'predict upcoming workload', zh:'预测近期需求', zhq:'预估即将到来的负载', tr:'yakın dönem talebini öngörmek', trq:'yaklaşan iş yükünü tahmin etmek' },
  { en:'validate an authorization', enq:'confirm permission validity', zh:'验证授权', zhq:'确认许可有效性', tr:'bir yetkilendirmeyi doğrulamak', trq:'izin geçerliliğini teyit etmek' },
  { en:'rotate access credentials', enq:'replace authentication secrets', zh:'轮换访问凭据', zhq:'更换认证密钥', tr:'erişim kimlik bilgilerini döndürmek', trq:'kimlik doğrulama sırlarını değiştirmek' },
  { en:'calibrate a monitoring sensor', enq:'tune a measurement device', zh:'校准监测传感器', zhq:'调校测量设备', tr:'izleme sensörünü kalibre etmek', trq:'ölçüm cihazını ayarlamak' },
  { en:'route a time-sensitive shipment', enq:'direct an urgent delivery', zh:'路由时效性货运', zhq:'安排紧急配送路径', tr:'zaman kritik sevkiyatı yönlendirmek', trq:'acil teslimatı rotalamak' },
  { en:'archive compliance evidence', enq:'preserve audit proof', zh:'归档合规证据', zhq:'保存审计证明', tr:'uyum kanıtlarını arşivlemek', trq:'denetim ispatını saklamak' },
  { en:'quarantine a suspect batch', enq:'segregate a questionable lot', zh:'隔离可疑批次', zhq:'分离问题批货', tr:'şüpheli partiyi karantinaya almak', trq:'sorunlu lotu ayırmak' },
  { en:'fail over a critical service', enq:'switch an essential system to backup', zh:'切换关键服务故障转移', zhq:'将核心系统切到备用', tr:'kritik hizmeti yedeğe geçirmek', trq:'temel sistemi yedek ortama almak' },
  { en:'prioritize a constrained queue', enq:'reorder a limited-capacity backlog', zh:'优化受限队列优先级', zhq:'重排容量受限积压', tr:'kısıtlı kuyruğu önceliklendirmek', trq:'sınırlı kapasiteli birikimi yeniden sıralamak' },
  { en:'restore a degraded service', enq:'recover an impaired system', zh:'恢复降级服务', zhq:'修复受损系统', tr:'bozulmuş hizmeti geri yüklemek', trq:'aksayan sistemi kurtarmak' },
  { en:'verify information provenance', enq:'confirm the origin trail of data', zh:'验证信息来源', zhq:'确认数据来源链', tr:'bilgi kaynağını doğrulamak', trq:'verinin köken zincirini teyit etmek' },
  { en:'release a controlled update', enq:'deploy an approved change', zh:'发布受控更新', zhq:'部署已批准变更', tr:'kontrollü bir güncellemeyi yayınlamak', trq:'onaylı değişikliği devreye almak' }
];

const conditionPairs = [
  {
    a:{ en:'during a scheduled low-risk window before any external handoff', enq:'in a planned calm period prior to transfer outside the team', zh:'在任何对外交接之前的计划低风险窗口内', zhq:'在向团队外移交前的预定平稳时段', tr:'herhangi bir dış devrin öncesindeki planlı düşük risk penceresinde', trq:'ekip dışına aktarım öncesi programlı sakin dönemde' },
    b:{ en:'during an emergency window after the external handoff has completed', enq:'in an urgent period once transfer outside the team is already finished', zh:'在对外交接完成后的紧急窗口内', zhq:'在向团队外移交已经结束后的紧急时段', tr:'dış devir tamamlandıktan sonraki acil durumda', trq:'ekip dışına aktarım bittikten sonraki ivedi dönemde' }
  },
  {
    a:{ en:'inside a private internal review before anything becomes customer-visible', enq:'within a non-public staff check prior to user exposure', zh:'在任何客户可见之前的内部私密审查阶段', zhq:'在用户看到之前的非公开员工检查中', tr:'müşteriye görünmeden önceki özel iç incelemede', trq:'kullanıcıya açılmadan önceki kamuya kapalı personel kontrolünde' },
    b:{ en:'inside a customer-facing public release after visibility has been enabled', enq:'during an outward-facing launch once users can already see it', zh:'在已启用可见性后的面向客户公开发布阶段', zhq:'在用户已经可以看到后的对外上线期间', tr:'görünürlük açıldıktan sonraki müşteriye dönük genel yayında', trq:'kullanıcılar görmeye başladıktan sonraki dışa açık lansmanda' }
  },
  {
    a:{ en:'while system load remains below the safety threshold', enq:'when utilization is still under the protective limit', zh:'在系统负载仍低于安全阈值时', zhq:'在利用率尚未超过保护上限时', tr:'sistem yükü güvenlik eşiğinin altında kalırken', trq:'kullanım koruyucu sınırın henüz altındayken' },
    b:{ en:'while system load is above the safety threshold and overload protection is active', enq:'when utilization has crossed the protective limit and saturation controls are engaged', zh:'在系统负载高于安全阈值且过载保护已启动时', zhq:'在利用率越过保护上限并启用饱和控制时', tr:'sistem yükü güvenlik eşiğinin üzerindeyken ve aşırı yük koruması etkinken', trq:'kullanım koruyucu sınırı aşıp doygunluk kontrolleri devredeyken' }
  },
  {
    a:{ en:'at the primary local site while normal infrastructure is available', enq:'on the main premises with ordinary facilities online', zh:'在正常基础设施可用的本地主站点', zhq:'在常规设施在线的主要现场', tr:'normal altyapı kullanılabilirken birincil yerel sahada', trq:'olağan tesisler çalışırken ana tesiste' },
    b:{ en:'at the remote disaster-recovery site while the primary site is unavailable', enq:'in the distant continuity facility because the main premises are offline', zh:'在主站点不可用时的远程灾难恢复站点', zhq:'由于主要现场离线而在远端连续性设施中', tr:'birincil saha kullanılamazken uzaktaki felaket kurtarma sahasında', trq:'ana tesis çevrimdışı olduğu için uzak süreklilik merkezinde' }
  },
  {
    a:{ en:'before formal approval has been granted and while the item remains provisional', enq:'while authorization is still pending and the item is only tentative', zh:'在正式批准尚未授予且项目仍为暂定状态时', zhq:'在授权仍待定且事项只是临时状态时', tr:'resmi onay verilmeden ve öğe geçici durumdayken', trq:'yetki hâlâ beklemedeyken ve konu yalnızca taslakken' },
    b:{ en:'after formal approval has been granted and the item is fully authorized', enq:'once authorization is complete and the item is no longer provisional', zh:'在正式批准已授予且项目已完全授权后', zhq:'在授权完成且事项不再是临时状态后', tr:'resmi onay verildikten ve öğe tamamen yetkilendirildikten sonra', trq:'yetki tamamlanıp konu artık taslak olmadığında' }
  }
];

const languages = ['en','zh','tr'];
const queryLabels = { en:'EN', zh:'CH', tr:'TR' };
const categories = ['synonym_only','cross_language','adversarial_near_duplicate'];
const nextLanguage = (language) => languages[(languages.indexOf(language) + 1) % languages.length];

function makeBlock(index) {
  const pairIndex = Math.floor(index / 2);
  const side = index % 2 === 0 ? 'a' : 'b';
  const domain = domains[pairIndex % domains.length];
  const operation = operations[Math.floor(pairIndex / domains.length) % operations.length];
  const conditions = conditionPairs[pairIndex % conditionPairs.length];
  const condition = conditions[side];
  const language = languages[(pairIndex + (side === 'b' ? 1 : 0)) % languages.length];
  const code = `SEM2-${String(index).padStart(3,'0')}-${side.toUpperCase()}`;
  const id = `semantic-record-${String(index).padStart(3,'0')}`;
  let text;
  if (language === 'en') {
    text = `Authoritative operating rule for ${domain.en}. The controlled activity is to ${operation.en}. This record applies ${condition.en}. In precisely this operational state, operators must follow the rule identified by ANSWER_CODE=${code}. The rule is current, authoritative, and specific to this condition.`;
  } else if (language === 'zh') {
    text = `这是关于${domain.zh}的权威运行规则。受控活动是${operation.zh}。本记录仅适用于${condition.zh}。在这一具体运行状态下，操作人员必须遵循由 ANSWER_CODE=${code} 标识的规则。该规则当前有效、具有权威性，并且只针对这一条件。`;
  } else {
    text = `${domain.tr} için yetkili işletim kuralı. Kontrollü faaliyet ${operation.tr}. Bu kayıt yalnızca ${condition.tr}. Tam olarak bu operasyonel durumda görevliler ANSWER_CODE=${code} ile tanımlanan kuralı izlemelidir. Kural güncel, yetkili ve bu koşula özeldir.`;
  }
  return { id, code, language, pairIndex, side, domain, operation, condition, text };
}

function questionFor(record, category) {
  const queryLanguage = category === 'cross_language' ? nextLanguage(record.language) : record.language;
  const domain = record.domain[`${queryLanguage}q`];
  const operation = record.operation[`${queryLanguage}q`];
  const condition = record.condition[`${queryLanguage}q`];
  let question;
  if (queryLanguage === 'en') {
    question = category === 'adversarial_near_duplicate'
      ? `The situation is specifically ${condition}. Which active rule token governs ${domain} while operators must ${operation}?`
      : `Which governing rule token applies to ${domain} when the team must ${operation} ${condition}?`;
  } else if (queryLanguage === 'zh') {
    question = category === 'adversarial_near_duplicate'
      ? `情况明确是${condition}。当操作人员需要${operation}时，${domain}应使用哪个当前有效的规则标记？`
      : `当团队需要${operation}且${condition}时，${domain}适用哪个权威规则标记？`;
  } else {
    question = category === 'adversarial_near_duplicate'
      ? `Durum özellikle ${condition}. Operatörler ${operation} zorundayken ${domain} için hangi etkin kural belirteci geçerlidir?`
      : `Ekip ${operation} gerektiğinde ve ${condition}, ${domain} için hangi yetkili kural belirteci uygulanır?`;
  }
  return { question, queryLanguage };
}

const records = Array.from({ length: corpusSize }, (_, index) => makeBlock(index));
const blocks = records.map(({ id, text }) => ({ id, text }));
const permutation = Array.from({ length: corpusSize }, (_, index) => (index * 37) % corpusSize);
const retrievalCases = permutation.slice(0, retrievalCaseCount).map((recordIndex, caseIndex) => {
  const record = records[recordIndex];
  const category = categories[caseIndex % categories.length];
  const { question, queryLanguage } = questionFor(record, category);
  return {
    caseIndex,
    recordIndex,
    id: record.id,
    code: record.code,
    blockLanguage: record.language,
    queryLanguage,
    category,
    question
  };
});

const fullContext = renderContextSelection(blocks);
const fullContextBytes = bytes(fullContext);

function normalizedUsage(kind, metadata = {}) {
  const usage = metadata.usage || {};
  if (kind === 'gemini') {
    const input = usage.promptTokenCount || 0;
    const output = usage.candidatesTokenCount ?? Math.max(0, (usage.totalTokenCount || 0) - input - (usage.thoughtsTokenCount || 0));
    return { input, output, total: usage.totalTokenCount || input + output + (usage.thoughtsTokenCount || 0) };
  }
  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  return { input, output, total: usage.total_tokens ?? input + output };
}

const comparableRates = {
  gpt: { input: 0.44, output: 1.76 },
  gemini: { input: 0.30, output: 2.50 }
};
function comparablePairCost(actorMetrics) {
  let total = 0;
  for (const alias of ['gpt','gemini']) {
    const metric = actorMetrics[alias];
    const rate = comparableRates[alias];
    total += (((metric?.usage?.input || 0) * rate.input) + ((metric?.usage?.output || 0) * rate.output)) / 1_000_000;
  }
  return total;
}

function actorPolicy(alias) {
  const providerOptions = alias === 'gemini'
    ? { thinkingBudget: 0 }
    : alias === 'kimi'
      ? { temperature: 0, maxTokens: 1024 }
      : { temperature: 0, maxTokens: 128 };
  return { benchmark: 'semantic-retrieval-v2', providerOptions };
}

function firstTask(question) {
  return `${question} Use only the supplied authoritative context. Return exactly one line: ANSWER=<ANSWER_CODE>.`;
}
function reviewTask(question) {
  return `${question} Verify the candidate against the supplied authoritative context. Return exactly one line: ANSWER=<ANSWER_CODE>.`;
}

function actorSpecs() {
  return [
    {
      alias:'gpt', kind:'azure', capability:'benchmark.semantic.v2.gpt',
      create:() => createAzureOpenAIProvider({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        model: process.env.AZURE_OPENAI_DEPLOYMENT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        capabilities:['benchmark.semantic.v2.gpt']
      })
    },
    {
      alias:'gemini', kind:'gemini', capability:'benchmark.semantic.v2.gemini',
      create:() => createVertexGeminiProvider({
        projectId:gcpProjectId,
        location:geminiLocation,
        model:geminiModel,
        endpoint:proxyEndpoint,
        accessTokenProvider:async () => proxyToken,
        capabilities:['benchmark.semantic.v2.gemini']
      })
    },
    ...[
      ['grok','xai',process.env.AZURE_FOUNDRY_GROK],
      ['deepseek','deepseek',process.env.AZURE_FOUNDRY_DEEPSEEK],
      ['llama','meta',process.env.AZURE_FOUNDRY_LLAMA],
      ['mistral','mistral',process.env.AZURE_FOUNDRY_MISTRAL],
      ['kimi','moonshot',process.env.AZURE_FOUNDRY_KIMI]
    ].map(([alias,vendor,deployment]) => ({
      alias,
      kind:'azure',
      capability:`benchmark.semantic.v2.${alias}`,
      create:() => createAzureFoundryProvider({
        endpoint:process.env.AZURE_FOUNDRY_ENDPOINT,
        deployment,
        apiKey:process.env.AZURE_FOUNDRY_API_KEY,
        vendor,
        family:alias,
        capabilities:[`benchmark.semantic.v2.${alias}`]
      })
    }))
  ];
}

function metricsBy(items, key) {
  return Object.fromEntries([...new Set(items.map((item) => item[key]))].sort().map((value) => {
    const group = items.filter((item) => item[key] === value);
    return [value, {
      cases: group.length,
      correct: group.filter((item) => item.correct).length,
      accuracyPercent: percent(group.filter((item) => item.correct).length, group.length),
      provenancePercent: percent(group.filter((item) => item.provenancePass).length, group.length)
    }];
  }));
}

async function main() {
  const embedder = createVertexEmbeddingClient({
    projectId:gcpProjectId,
    location:embeddingLocation,
    model:embeddingModel,
    endpoint:proxyEndpoint,
    accessTokenProvider:async () => proxyToken,
    batchSize:5
  });
  const semanticRouter = createSemanticContextRouterV2({ embedder });
  const context = semanticRouter.putContext(blocks, {
    benchmark:'semantic-retrieval-v2',
    languages:['CH','EN','TR'],
    adversarialNearDuplicates:true
  });

  // Force a single document-index build before concurrent query evaluation.
  await semanticRouter.retrieve(context.cid, retrievalCases[0].question, { topK:1 });

  const retrievalResults = [];
  const concurrency = 4;
  for (let offset = 0; offset < retrievalCases.length; offset += concurrency) {
    const batch = retrievalCases.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map(async (item) => {
      const retrieved = await semanticRouter.retrieve(context.cid, item.question, { topK:1 });
      const top = retrieved.blocks[0];
      const proof = retrieved.retrieval?.selected?.[0];
      const provenancePass = Boolean(
        retrieved.retrieval?.algorithm === CONTEXT_RETRIEVAL_ALGORITHM_V2
        && retrieved.retrieval?.rootCid === context.cid
        && retrieved.retrieval?.manifestCid === context.cid
        && retrieved.retrieval?.queryHash === contextQueryHash(item.question)
        && proof?.id === top?.id
        && proof?.cid === top?.cid
        && proof?.rank === 1
      );
      let lexicalSelectedId = null;
      try { lexicalSelectedId = retrieveContextBlocks(blocks, item.question, { topK:1 }).blocks[0]?.id || null; } catch {}
      return {
        ...item,
        selectedId:top?.id || null,
        correct:top?.id === item.id,
        provenancePass,
        noBlockId:!item.question.includes(item.id) && !item.question.includes(item.code),
        score:top?.score ?? null,
        semanticScore:top?.semanticScore ?? null,
        lexicalV1SelectedId:lexicalSelectedId,
        lexicalV1Correct:lexicalSelectedId === item.id
      };
    }));
    retrievalResults.push(...results);
    if ((offset + batch.length) % 60 === 0 || offset + batch.length === retrievalCases.length) {
      process.stderr.write(`semantic-v2 retrieval ${offset + batch.length}/${retrievalCases.length}\n`);
    }
  }

  const retrievalAccuracy = percent(retrievalResults.filter((item) => item.correct).length, retrievalResults.length);
  const provenancePercent = percent(retrievalResults.filter((item) => item.provenancePass).length, retrievalResults.length);
  const noBlockIdPercent = percent(retrievalResults.filter((item) => item.noBlockId).length, retrievalResults.length);
  const lexicalV1Accuracy = percent(retrievalResults.filter((item) => item.lexicalV1Correct).length, retrievalResults.length);
  const byCategory = metricsBy(retrievalResults, 'category');
  const byQueryLanguage = metricsBy(retrievalResults, 'queryLanguage');
  const retrievalOnlyPassed = retrievalAccuracy >= gate.retrievalAccuracyPercentMin
    && provenancePercent >= gate.provenancePassPercentMin
    && noBlockIdPercent >= gate.noBlockIdPassPercentMin
    && Object.values(byCategory).every((metric) => metric.accuracyPercent >= gate.perCategoryAccuracyPercentMin)
    && Object.values(byQueryLanguage).every((metric) => metric.accuracyPercent >= gate.perLanguageAccuracyPercentMin);

  const reportBase = {
    benchmark:'TRUYN Semantic Retrieval Gate v2',
    generatedAt:new Date().toISOString(),
    corpus:{
      blocks:corpusSize,
      languages:['CH','EN','TR'],
      pairCount:corpusSize / 2,
      adversarialNearDuplicatePairs:corpusSize / 2,
      fullContextBytes
    },
    retrieval:{
      cases:retrievalResults.length,
      correct:retrievalResults.filter((item) => item.correct).length,
      accuracyPercent:retrievalAccuracy,
      provenancePercent,
      noBlockIdPercent,
      byCategory,
      byQueryLanguage:Object.fromEntries(Object.entries(byQueryLanguage).map(([key,value]) => [queryLabels[key] || key,value])),
      lexicalV1BaselineAccuracyPercent:lexicalV1Accuracy,
      algorithm:CONTEXT_RETRIEVAL_ALGORITHM_V2
    },
    embedding:embedder.stats(),
    methodology:{
      callerKnowledge:'natural-language question + root CID only',
      topK:1,
      blockIdsInRequesterQueries:false,
      idsArrayInRequesterPayload:false,
      multilingual:['Chinese (Simplified)','English','Turkish'],
      queryFamilies:['synonym-only same-language','cross-language','adversarial near-duplicate'],
      modelIndependentContextRouting:true,
      immutableProvenance:'root CID -> manifest CID -> block CID + normalized query hash + rank'
    }
  };

  if (!retrievalOnlyPassed) {
    const semanticGate = {
      thresholds:gate,
      checks:{ retrievalOnlyPassed },
      passed:false
    };
    await writeFile(outputPath, JSON.stringify({ ...reportBase, status:'failed_retrieval', semanticGate, retrievalResults }, null, 2));
    console.log(JSON.stringify({ ...reportBase, status:'failed_retrieval', semanticGate }, null, 2));
    process.exitCode = 2;
    return;
  }

  const relay = createRelay({ localDevelopmentMode:true, exposeDiagnostics:true, maxNodes:128, maxOffers:256 });
  const relayUrl = await relay.listen();
  const requesterIdentity = createIdentity();
  const requester = new TruynNode({ relayUrl, identity:requesterIdentity });
  await requester.register({ name:'semantic-v2-requester' });
  const requesterOnlyPolicy = {
    mode:'benchmark-requester-only',
    authorize(need) {
      return need?.from === requesterIdentity.nodeId
        ? { ok:true, mode:this.mode, requesterId:need.from }
        : { ok:false, mode:this.mode, reason:'requester_not_allowed' };
    }
  };

  const actors = actorSpecs().map((spec) => {
    const retrievalLog = [];
    const identity = createIdentity();
    const node = new SemanticTruynNode({ relayUrl, identity, semanticRouter, retrievalLog });
    const adapter = spec.create();
    const host = new TruynAdapterHost({ node, adapter, fastPath:true, socketPath:true, accessPolicy:requesterOnlyPolicy });
    return { ...spec, identity, node, adapter, host, retrievalLog };
  });

  try {
    await Promise.all(actors.map((actor) => actor.host.start()));
    const actorRoutes = {};
    for (const actor of actors) {
      const found = await requester.find(actor.capability);
      const offer = found.offers?.find((item) => item.from === actor.identity.nodeId);
      if (!offer) throw new Error(`Missing TRUYN offer for ${actor.alias}`);
      actorRoutes[actor.alias] = { nodeId:actor.identity.nodeId, capability:actor.capability, offerId:offer.id || offer.offerId || null };
    }
    if (new Set(Object.values(actorRoutes).map((route) => route.nodeId)).size !== actors.length) throw new Error('Actor identities are not distinct');

    const liveCases = [];
    const seenCells = new Set();
    for (const item of retrievalCases) {
      const cell = `${item.category}:${item.queryLanguage}`;
      if (!seenCells.has(cell)) {
        seenCells.add(cell);
        liveCases.push(item);
      }
      if (liveCases.length >= liveCaseCount) break;
    }
    while (liveCases.length < liveCaseCount) liveCases.push(retrievalCases[liveCases.length]);

    async function directRun(item) {
      const startedAt = Date.now();
      const actorMetrics = {};
      let candidate = null;
      for (let stage = 0; stage < actors.length; stage += 1) {
        const actor = actors[stage];
        const execution = await withRetry(`direct:${item.caseIndex}:${actor.alias}`, () => actor.adapter.execute({
          capability:actor.capability,
          input:stage === 0
            ? { task:firstTask(item.question), context:fullContext }
            : { task:reviewTask(item.question), candidate, context:fullContext },
          policy:actorPolicy(actor.alias)
        }));
        const usage = normalizedUsage(actor.kind, execution.metadata);
        candidate = execution.output;
        actorMetrics[actor.alias] = {
          output:execution.output,
          answerPass:String(execution.output).includes(item.code),
          usage,
          providerRequestBodyBytes:execution.metadata?.providerRequestBodyBytes || 0,
          providerLatencyMs:execution.metadata?.providerLatencyMs || null
        };
      }
      return {
        candidate,
        answerPass:String(candidate).includes(item.code),
        actorMetrics,
        inputTokens:sum(Object.values(actorMetrics), (metric) => metric.usage.input),
        outputTokens:sum(Object.values(actorMetrics), (metric) => metric.usage.output),
        providerRequestBodyBytes:sum(Object.values(actorMetrics), (metric) => metric.providerRequestBodyBytes),
        comparablePairCostUsd:comparablePairCost(actorMetrics),
        elapsedMs:Date.now() - startedAt
      };
    }

    async function truynRun(item) {
      const startedAt = Date.now();
      const actorMetrics = {};
      const logOffsets = Object.fromEntries(actors.map((actor) => [actor.alias, actor.retrievalLog.length]));
      let candidate = null;
      let payloadNoBlockId = true;
      for (let stage = 0; stage < actors.length; stage += 1) {
        const actor = actors[stage];
        const ref = { $context:{ cid:context.cid, query:item.question, topK:1 } };
        const input = stage === 0
          ? { task:firstTask(item.question), context:ref }
          : { task:reviewTask(item.question), candidate, context:ref };
        const serializedInput = JSON.stringify(input);
        payloadNoBlockId = payloadNoBlockId && !serializedInput.includes(item.id) && !serializedInput.includes(item.code) && !serializedInput.includes('"ids"');
        const response = await withRetry(`truyn:${item.caseIndex}:${actor.alias}`, () => requester.compactNeed(
          actor.capability,
          input,
          actorPolicy(actor.alias),
          { waitMs:120_000 }
        ));
        if (!response.ok || response.metadata?.failed) throw new Error(`TRUYN actor ${actor.alias} failed: ${response.metadata?.error || 'unknown'}`);
        candidate = response.output;
        const usage = normalizedUsage(actor.kind, response.metadata);
        actorMetrics[actor.alias] = {
          output:response.output,
          answerPass:String(response.output).includes(item.code),
          usage,
          providerRequestBodyBytes:response.metadata?.providerRequestBodyBytes || 0,
          providerLatencyMs:response.metadata?.providerLatencyMs || null,
          contextResolution:response.metadata?.contextResolution || null,
          truynPayloadBytes:response.truynPayloadBytes || 0,
          protocolOverheadBytes:response.protocolOverheadBytes || 0
        };
      }
      const retrievalLogs = Object.fromEntries(actors.map((actor) => [actor.alias, actor.retrievalLog.slice(logOffsets[actor.alias])]));
      const logs = Object.values(retrievalLogs).flat();
      const provenancePass = logs.length === actors.length && logs.every((entry) =>
        entry.provenanceVerified
        && entry.cid === context.cid
        && entry.queryHash === contextQueryHash(item.question)
        && entry.algorithm === CONTEXT_RETRIEVAL_ALGORITHM_V2
        && entry.selected?.length === 1
        && entry.selected[0]?.id === item.id
        && entry.selected[0]?.rank === 1
      );
      const minimalContextPass = Object.values(actorMetrics).every((metric) =>
        metric.contextResolution?.contextRefs === 1
        && metric.contextResolution?.retrievalQueries === 1
        && metric.contextResolution?.provenanceVerifiedRefs === 1
        && metric.contextResolution?.selectedBlocks === 1
      );
      return {
        candidate,
        answerPass:String(candidate).includes(item.code),
        actorMetrics,
        retrievalLogs,
        provenancePass,
        minimalContextPass,
        payloadNoBlockId,
        inputTokens:sum(Object.values(actorMetrics), (metric) => metric.usage.input),
        outputTokens:sum(Object.values(actorMetrics), (metric) => metric.usage.output),
        providerRequestBodyBytes:sum(Object.values(actorMetrics), (metric) => metric.providerRequestBodyBytes),
        truynPayloadBytes:sum(Object.values(actorMetrics), (metric) => metric.truynPayloadBytes),
        protocolOverheadBytes:sum(Object.values(actorMetrics), (metric) => metric.protocolOverheadBytes),
        comparablePairCostUsd:comparablePairCost(actorMetrics),
        elapsedMs:Date.now() - startedAt
      };
    }

    const liveResults = [];
    for (let index = 0; index < liveCases.length; index += 1) {
      const item = liveCases[index];
      process.stderr.write(`semantic-v2 live ${index + 1}/${liveCases.length}: ${item.category}/${queryLabels[item.queryLanguage]}\n`);
      const direct = await directRun(item);
      const truyn = await truynRun(item);
      liveResults.push({ item, direct, truyn });
      if (index + 1 < liveCases.length && pacingMs > 0) await sleep(pacingMs);
    }

    const allTruynActorMetrics = liveResults.flatMap((run) => Object.entries(run.truyn.actorMetrics).map(([alias,metric]) => ({ alias, ...metric })));
    const allDirectActorMetrics = liveResults.flatMap((run) => Object.entries(run.direct.actorMetrics).map(([alias,metric]) => ({ alias, ...metric })));
    const actorSummary = Object.fromEntries(actors.map((actor) => {
      const direct = allDirectActorMetrics.filter((metric) => metric.alias === actor.alias);
      const truyn = allTruynActorMetrics.filter((metric) => metric.alias === actor.alias);
      return [actor.alias, {
        identity:actor.identity.nodeId,
        stages:truyn.length,
        directAnswerAccuracyPercent:percent(direct.filter((metric) => metric.answerPass).length, direct.length),
        truynAnswerAccuracyPercent:percent(truyn.filter((metric) => metric.answerPass).length, truyn.length),
        directInputTokens:sum(direct, (metric) => metric.usage.input),
        truynInputTokens:sum(truyn, (metric) => metric.usage.input),
        inputTokenReductionPercent:reductionPercent(sum(direct, (metric) => metric.usage.input), sum(truyn, (metric) => metric.usage.input))
      }];
    }));

    const directInputTokens = sum(liveResults, (run) => run.direct.inputTokens);
    const truynInputTokens = sum(liveResults, (run) => run.truyn.inputTokens);
    const directCost = sum(liveResults, (run) => run.direct.comparablePairCostUsd);
    const truynCost = sum(liveResults, (run) => run.truyn.comparablePairCostUsd);
    const truynStagePasses = allTruynActorMetrics.filter((metric) => metric.answerPass).length;
    const totalStages = allTruynActorMetrics.length;
    const answerAccuracyPercent = percent(truynStagePasses, totalStages);
    const liveProvenancePercent = percent(liveResults.filter((run) => run.truyn.provenancePass).length, liveResults.length);
    const liveMinimalContextPercent = percent(liveResults.filter((run) => run.truyn.minimalContextPass).length, liveResults.length);
    const liveNoBlockIdPercent = percent(liveResults.filter((run) => run.truyn.payloadNoBlockId).length, liveResults.length);
    const inputTokenReductionPercent = reductionPercent(directInputTokens, truynInputTokens);
    const comparablePairCostReductionPercent = reductionPercent(directCost, truynCost);

    const checks = {
      retrievalAccuracy:retrievalAccuracy >= gate.retrievalAccuracyPercentMin,
      perLanguageAccuracy:Object.values(byQueryLanguage).every((metric) => metric.accuracyPercent >= gate.perLanguageAccuracyPercentMin),
      perCategoryAccuracy:Object.values(byCategory).every((metric) => metric.accuracyPercent >= gate.perCategoryAccuracyPercentMin),
      answerAccuracy:answerAccuracyPercent >= gate.answerAccuracyPercentMin,
      inputTokenReduction:inputTokenReductionPercent >= gate.inputTokenReductionPercentMin,
      comparablePairCostReduction:comparablePairCostReductionPercent >= gate.comparablePairCostReductionPercentMin,
      provenance:provenancePercent >= gate.provenancePassPercentMin && liveProvenancePercent >= gate.provenancePassPercentMin,
      noBlockId:noBlockIdPercent >= gate.noBlockIdPassPercentMin && liveNoBlockIdPercent >= gate.noBlockIdPassPercentMin,
      minimalContext:liveMinimalContextPercent >= gate.minimalContextPassPercentMin,
      actorStageSuccess:answerAccuracyPercent >= gate.actorStageSuccessPercentMin
    };
    const semanticGate = { thresholds:gate, checks, passed:Object.values(checks).every(Boolean) };

    const report = {
      ...reportBase,
      status:semanticGate.passed ? 'passed' : 'failed',
      actors:{ count:actors.length, routes:actorRoutes, summary:actorSummary },
      live:{
        cases:liveResults.length,
        stages:totalStages,
        answerAccuracyPercent,
        provenancePercent:liveProvenancePercent,
        minimalContextPercent:liveMinimalContextPercent,
        noBlockIdPercent:liveNoBlockIdPercent,
        directInputTokens,
        truynInputTokens,
        inputTokenReductionPercent,
        directComparablePairCostUsd:round(directCost, 9),
        truynComparablePairCostUsd:round(truynCost, 9),
        comparablePairCostReductionPercent,
        directProviderRequestBodyBytes:sum(liveResults, (run) => run.direct.providerRequestBodyBytes),
        truynProviderRequestBodyBytes:sum(liveResults, (run) => run.truyn.providerRequestBodyBytes),
        providerRequestBodyReductionPercent:reductionPercent(
          sum(liveResults, (run) => run.direct.providerRequestBodyBytes),
          sum(liveResults, (run) => run.truyn.providerRequestBodyBytes)
        ),
        directElapsedMeanMs:round(mean(liveResults, (run) => run.direct.elapsedMs), 3),
        truynElapsedMeanMs:round(mean(liveResults, (run) => run.truyn.elapsedMs), 3)
      },
      comparableCostMethodology:{
        scope:'GPT + Gemini variable inference reference-rate comparison, same methodology family as v1 gate',
        usdPerMillionTokens:comparableRates
      },
      semanticRouterStats:semanticRouter.stats(),
      embedding:embedder.stats(),
      retryEvents,
      semanticGate,
      liveResults,
      retrievalResults
    };
    await writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      benchmark:report.benchmark,
      status:report.status,
      corpus:report.corpus,
      retrieval:report.retrieval,
      actors:report.actors.summary,
      live:report.live,
      semanticGate:report.semanticGate,
      embedding:report.embedding
    }, null, 2));
    if (!semanticGate.passed) process.exitCode = 2;
  } finally {
    requester.closeFastSocket();
    await Promise.all(actors.map((actor) => actor.host.stop()));
    await relay.close();
  }
}

await main();
