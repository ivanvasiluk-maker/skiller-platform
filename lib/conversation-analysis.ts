import { getRawDb } from "@/db";

export type SituationAnalysisStage =
  | "clarify" | "confirm" | "correct"
  | "chain_trigger" | "chain_thought" | "chain_emotion_body"
  | "chain_urge" | "chain_action" | "chain_consequences"
  | "chain_confirm" | "chain_correct" | "chain_edit_choose"
  | "edit_trigger" | "edit_thought" | "edit_emotion_body"
  | "edit_urge" | "edit_action" | "edit_consequences" | "chain_choose";
export type InterventionPoint = "thought" | "body" | "urge" | "action";
export type ChainEditField = "trigger" | "thought" | "emotionBody" | "urge" | "action" | "consequences";
export type SituationChain = {
  trigger?: string;
  thought?: string;
  emotionBody?: string;
  urge?: string;
  action?: string;
  consequences?: string;
  correction?: string;
  interventionPoint?: InterventionPoint;
};
export type SituationAnalysisSession = {
  id: string;
  user_id: string;
  status: "pending" | "completed";
  stage: SituationAnalysisStage;
  analysis_depth: "simple" | "complex";
  original_text: string;
  kind: "stuck" | "emotion" | "conflict" | "other";
  mode: "practice" | "stuck" | "distress";
  signal: "thought" | "body" | "emotion" | "urge";
  urge: "avoid" | "distract" | "attack" | "withdraw";
  intensity: number;
  risk: "no";
  clarification: string;
  hypothesis: string;
  chain_json: string;
  memory_pattern_id: string;
  memory_dismissed: number;
  created_at: string;
  updated_at: string;
};
export type BehavioralPattern = {
  id: string;
  user_id: string;
  analysis_id: string;
  kind: string;
  action_urge: string;
  topic: string;
  trigger: string;
  thought: string;
  emotion_body: string;
  urge: string;
  action: string;
  consequences: string;
  intervention_point: InterventionPoint;
  occurrence_count: number;
  created_at: string;
};

export const CONVERSATION_ANALYSIS_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS conversation_analysis_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    stage TEXT NOT NULL DEFAULT 'clarify',
    analysis_depth TEXT NOT NULL DEFAULT 'simple',
    original_text TEXT NOT NULL,
    kind TEXT NOT NULL,
    mode TEXT NOT NULL,
    signal TEXT NOT NULL,
    urge TEXT NOT NULL,
    intensity INTEGER NOT NULL,
    risk TEXT NOT NULL DEFAULT 'no',
    clarification TEXT NOT NULL DEFAULT '',
    hypothesis TEXT NOT NULL DEFAULT '',
    chain_json TEXT NOT NULL DEFAULT '{}',
    memory_pattern_id TEXT NOT NULL DEFAULT '',
    memory_dismissed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS conversation_analysis_user_status ON conversation_analysis_sessions(user_id,status,created_at)",
  `CREATE TABLE IF NOT EXISTS behavioral_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    analysis_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    action_urge TEXT NOT NULL,
    topic TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT '',
    thought TEXT NOT NULL DEFAULT '',
    emotion_body TEXT NOT NULL DEFAULT '',
    urge TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    consequences TEXT NOT NULL DEFAULT '',
    intervention_point TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS behavioral_memory_user_pattern ON behavioral_memory(user_id,kind,action_urge,created_at)",
];

export async function ensureConversationAnalysisStorage() {
  const db = getRawDb();
  await db.batch(CONVERSATION_ANALYSIS_STATEMENTS.map((sql) => db.prepare(sql)));
  for (const sql of [
    "ALTER TABLE conversation_analysis_sessions ADD analysis_depth TEXT NOT NULL DEFAULT 'simple'",
    "ALTER TABLE conversation_analysis_sessions ADD chain_json TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE conversation_analysis_sessions ADD memory_pattern_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE conversation_analysis_sessions ADD memory_dismissed INTEGER NOT NULL DEFAULT 0",
  ]) {
    try { await db.prepare(sql).run(); } catch { /* Column already exists. */ }
  }
}

export async function pendingSituationAnalysis(userId: string) {
  await ensureConversationAnalysisStorage();
  return (await getRawDb()
    .prepare("SELECT * FROM conversation_analysis_sessions WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1")
    .bind(userId)
    .first<SituationAnalysisSession>()) ?? null;
}

export async function createSituationAnalysis(input: Omit<SituationAnalysisSession, "id" | "status" | "stage" | "clarification" | "hypothesis" | "chain_json" | "memory_pattern_id" | "memory_dismissed" | "created_at" | "updated_at"> & { memoryPatternId?: string }) {
  await ensureConversationAnalysisStorage();
  const now = new Date().toISOString();
  const session: SituationAnalysisSession = {
    ...input,
    id: crypto.randomUUID(),
    status: "pending",
    stage: input.analysis_depth === "complex" ? "chain_trigger" : "clarify",
    clarification: "",
    hypothesis: "",
    chain_json: "{}",
    memory_pattern_id: input.memoryPatternId ?? "",
    memory_dismissed: 0,
    created_at: now,
    updated_at: now,
  };
  await getRawDb().prepare(
    "INSERT INTO conversation_analysis_sessions (id,user_id,status,stage,analysis_depth,original_text,kind,mode,signal,urge,intensity,risk,clarification,hypothesis,chain_json,memory_pattern_id,memory_dismissed,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(
    session.id, session.user_id, session.status, session.stage, session.analysis_depth, session.original_text,
    session.kind, session.mode, session.signal, session.urge, session.intensity,
    session.risk, session.clarification, session.hypothesis, session.chain_json, session.memory_pattern_id, session.memory_dismissed, session.created_at, session.updated_at,
  ).run();
  return session;
}

export function clarificationQuestion(kind: SituationAnalysisSession["kind"]) {
  if (kind === "conflict") return "Вспомните конкретный момент: что человек сказал или сделал прямо перед Вашей реакцией?";
  if (kind === "emotion") return "Что произошло непосредственно перед тем, как эмоция стала сильной?";
  if (kind === "stuck") return "Вспомните момент прямо перед тем, как Вы отложили действие: что произошло или какая мысль мелькнула?";
  return "Что произошло непосредственно перед этой реакцией? Опишите один конкретный момент.";
}

const signalLabels: Record<SituationAnalysisSession["signal"], string> = {
  thought: "мысль или оценка ситуации",
  body: "телесная реакция",
  emotion: "сильная эмоция",
  urge: "импульс к действию",
};
const urgeLabels: Record<SituationAnalysisSession["urge"], string> = {
  avoid: "отложить или замереть",
  distract: "переключиться на что-то другое",
  attack: "спорить или доказывать",
  withdraw: "уйти или закрыться",
};

export function buildWorkingHypothesis(session: SituationAnalysisSession, clarification: string) {
  return `Рабочая гипотеза: когда «${clarification}», первой включается ${signalLabels[session.signal]}, а затем появляется желание ${urgeLabels[session.urge]}. Значит, полезно проверить навык в момент между первым сигналом и привычным действием. Это похоже на Ваш опыт?`;
}

export function complexAnalysisQuestion(stage: SituationAnalysisStage) {
  switch (stage) {
    case "chain_trigger": return "Возьмём один конкретный эпизод. Что произошло непосредственно перед тем, как Вы застряли или отреагировали?";
    case "chain_thought": return "Что в тот момент мелькнуло в голове? Можно записать точную фразу, образ или смысл.";
    case "chain_emotion_body": return "Какие эмоции и ощущения в теле появились сразу после этой мысли?";
    case "chain_urge": return "Что Вам захотелось сделать в этот момент — отложить, отвлечься, уйти, спорить или что-то другое?";
    case "chain_action": return "Что Вы фактически сделали после этого — даже если действием было ничего не делать?";
    case "chain_consequences": return "Что это дало сразу и к чему привело позже? Например: сначала стало легче, но задача осталась.";
    default: return "Продолжите описание этого эпизода своими словами.";
  }
}

export function readSituationChain(session: SituationAnalysisSession): SituationChain {
  try { return JSON.parse(session.chain_json) as SituationChain; } catch { return {}; }
}

export function buildChainHypothesis(session: SituationAnalysisSession, chain: SituationChain) {
  const correction = chain.correction ? `\nВаше уточнение: ${chain.correction}.` : "";
  return `Собрал цепочку как рабочую гипотезу:\nСобытие: ${chain.trigger ?? "не уточнено"}.\nМысль или смысл: ${chain.thought ?? "не уточнено"}.\nЭмоции и тело: ${chain.emotionBody ?? "не уточнено"}.\nИмпульс: ${chain.urge ?? "не уточнено"}.\nДействие: ${chain.action ?? "не уточнено"}.\nПоследствия: ${chain.consequences ?? "не уточнено"}.${correction}\nТочка для вмешательства — после первого сигнала и до привычного действия. Это похоже на Ваш опыт?`;
}

const chainTransitions: Partial<Record<SituationAnalysisStage, { field: keyof SituationChain; next: SituationAnalysisStage }>> = {
  chain_trigger: { field: "trigger", next: "chain_thought" },
  chain_thought: { field: "thought", next: "chain_emotion_body" },
  chain_emotion_body: { field: "emotionBody", next: "chain_urge" },
  chain_urge: { field: "urge", next: "chain_action" },
  chain_action: { field: "action", next: "chain_consequences" },
  chain_consequences: { field: "consequences", next: "chain_confirm" },
  chain_correct: { field: "correction", next: "chain_confirm" },
  edit_trigger: { field: "trigger", next: "chain_confirm" },
  edit_thought: { field: "thought", next: "chain_confirm" },
  edit_emotion_body: { field: "emotionBody", next: "chain_confirm" },
  edit_urge: { field: "urge", next: "chain_confirm" },
  edit_action: { field: "action", next: "chain_confirm" },
  edit_consequences: { field: "consequences", next: "chain_confirm" },
};

export async function advanceComplexAnalysis(session: SituationAnalysisSession, answer: string) {
  const transition = chainTransitions[session.stage];
  if (!transition) throw new Error("Этап поведенческой цепочки не найден.");
  const chain = { ...readSituationChain(session), [transition.field]: answer };
  const hypothesis = transition.next === "chain_confirm" ? buildChainHypothesis(session, chain) : session.hypothesis;
  await getRawDb().prepare("UPDATE conversation_analysis_sessions SET stage=?,chain_json=?,hypothesis=?,updated_at=? WHERE id=? AND status='pending'")
    .bind(transition.next, JSON.stringify(chain), hypothesis, new Date().toISOString(), session.id).run();
  return transition.next === "chain_confirm" ? hypothesis : complexAnalysisQuestion(transition.next);
}

export function isHypothesisConfirmed(text: string) {
  return /^(да|верно|точно|похоже|согласен|согласна)(\b|[,.!])/iu.test(text.trim());
}

export function isBareRejection(text: string) {
  return /^(нет|не совсем|не похоже|неверно)[.!]?$/iu.test(text.trim());
}

export const interventionPointPrompt = "Где сейчас полезнее потренироваться? Можно выбрать мысль, тело и эмоцию, импульс или конкретное действие. Safety и история результатов всё равно остаются приоритетнее выбора.";

export function parseInterventionPoint(text: string): InterventionPoint | null {
  const normalized = text.trim().toLowerCase();
  if (/мысл|интерпретац|факт/u.test(normalized)) return "thought";
  if (/тел|эмоц|напряж|ощущ/u.test(normalized)) return "body";
  if (/импульс|позыв|желани/u.test(normalized)) return "urge";
  if (/действ|шаг|нача/u.test(normalized)) return "action";
  return null;
}

const chainEditStages: Record<ChainEditField, SituationAnalysisStage> = {
  trigger: "edit_trigger",
  thought: "edit_thought",
  emotionBody: "edit_emotion_body",
  urge: "edit_urge",
  action: "edit_action",
  consequences: "edit_consequences",
};

export const chainEditPrompt = "Какое звено нужно изменить: событие, мысль, эмоции и тело, импульс, действие или последствия?";

export function parseChainEditField(text: string): ChainEditField | null {
  const normalized = text.trim().toLowerCase();
  if (/событ|триггер|произош/u.test(normalized)) return "trigger";
  if (/мысл|смысл|интерпретац/u.test(normalized)) return "thought";
  if (/эмоц|тел|ощущ/u.test(normalized)) return "emotionBody";
  if (/импульс|позыв|желани/u.test(normalized)) return "urge";
  if (/последств|результат|потом/u.test(normalized)) return "consequences";
  if (/действ|сделал|сделала/u.test(normalized)) return "action";
  return null;
}

export async function chooseChainEditField(session: SituationAnalysisSession, field: ChainEditField) {
  const stage = chainEditStages[field];
  await getRawDb().prepare("UPDATE conversation_analysis_sessions SET stage=?,updated_at=? WHERE id=? AND status='pending'")
    .bind(stage, new Date().toISOString(), session.id).run();
  const labels: Record<ChainEditField, string> = {
    trigger: "Что произошло на самом деле непосредственно перед реакцией?",
    thought: "Какая мысль, фраза или смысл точнее описывает этот момент?",
    emotionBody: "Какие эмоции и ощущения в теле точнее описывают этот момент?",
    urge: "Какой импульс или желание возникло на самом деле?",
    action: "Что Вы фактически сделали?",
    consequences: "Что это дало сразу и к чему привело позже?",
  };
  return labels[field];
}

export async function moveToInterventionChoice(id: string) {
  await getRawDb().prepare("UPDATE conversation_analysis_sessions SET stage='chain_choose',updated_at=? WHERE id=? AND status='pending'")
    .bind(new Date().toISOString(), id).run();
}

export async function saveInterventionPoint(session: SituationAnalysisSession, point: InterventionPoint) {
  const chain = { ...readSituationChain(session), interventionPoint: point };
  const signal = point === "action" ? session.signal : point;
  await getRawDb().prepare("UPDATE conversation_analysis_sessions SET chain_json=?,signal=?,updated_at=? WHERE id=? AND status='pending'")
    .bind(JSON.stringify(chain), signal, new Date().toISOString(), session.id).run();
  return signal;
}

export async function saveBehavioralPattern(session: SituationAnalysisSession, point: InterventionPoint) {
  const chain = readSituationChain(session);
  const clip = (value?: string, max = 300) => (value ?? "").trim().slice(0, max);
  await ensureConversationAnalysisStorage();
  await getRawDb().prepare(
    "INSERT OR IGNORE INTO behavioral_memory (id,user_id,analysis_id,kind,action_urge,topic,trigger,thought,emotion_body,urge,action,consequences,intervention_point,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(
    crypto.randomUUID(), session.user_id, session.id, session.kind, session.urge,
    clip(session.original_text, 160), clip(chain.trigger), clip(chain.thought),
    clip(chain.emotionBody), clip(chain.urge), clip(chain.action),
    clip(chain.consequences), point, new Date().toISOString(),
  ).run();
}

export async function relevantBehavioralPattern(userId: string, kind: string, actionUrge: string): Promise<BehavioralPattern | null> {
  await ensureConversationAnalysisStorage();
  return (await getRawDb().prepare(
    `SELECT b.*,
      (SELECT count(*) FROM behavioral_memory x WHERE x.user_id=b.user_id AND x.kind=b.kind AND x.action_urge=b.action_urge) AS occurrence_count
     FROM behavioral_memory b
     WHERE b.user_id=? AND b.kind=? AND b.action_urge=?
     ORDER BY b.created_at DESC LIMIT 1`,
  ).bind(userId, kind, actionUrge).first<BehavioralPattern>()) ?? null;
}

export async function recentBehavioralPatterns(userId: string): Promise<BehavioralPattern[]> {
  await ensureConversationAnalysisStorage();
  const rows = await getRawDb().prepare(
    `SELECT b.*,
      (SELECT count(*) FROM behavioral_memory x WHERE x.user_id=b.user_id AND x.kind=b.kind AND x.action_urge=b.action_urge) AS occurrence_count
     FROM behavioral_memory b WHERE b.user_id=? ORDER BY b.created_at DESC LIMIT 5`,
  ).bind(userId).all<BehavioralPattern>();
  return rows.results;
}

export function behavioralMemoryPrompt(pattern: BehavioralPattern) {
  const frequency = Number(pattern.occurrence_count) >= 2
    ? `Это повторялось в ${pattern.occurrence_count} подтверждённых разборах.`
    : "Это было в одном предыдущем подтверждённом разборе.";
  const remembered = pattern.thought || pattern.urge || pattern.action;
  return `Небольшая проверка памяти: раньше в похожей ситуации Вы описывали «${remembered}». ${frequency} Не буду считать, что сейчас всё так же — проверим текущий эпизод заново.`;
}

export async function behavioralPatternById(userId: string, id: string): Promise<BehavioralPattern | null> {
  if (!id) return null;
  await ensureConversationAnalysisStorage();
  return (await getRawDb().prepare(
    `SELECT b.*,
      (SELECT count(*) FROM behavioral_memory x WHERE x.user_id=b.user_id AND x.kind=b.kind AND x.action_urge=b.action_urge) AS occurrence_count
     FROM behavioral_memory b WHERE b.user_id=? AND b.id=? LIMIT 1`,
  ).bind(userId, id).first<BehavioralPattern>()) ?? null;
}

export async function dismissBehavioralMemory(userId: string, analysisId: string) {
  await ensureConversationAnalysisStorage();
  await getRawDb().prepare(
    "UPDATE conversation_analysis_sessions SET memory_dismissed=1,updated_at=? WHERE id=? AND user_id=? AND status='pending'",
  ).bind(new Date().toISOString(), analysisId, userId).run();
}

export async function applyBehavioralMemoryDraft(session: SituationAnalysisSession, pattern: BehavioralPattern) {
  if (session.analysis_depth !== "complex" || session.memory_pattern_id !== pattern.id) {
    throw new Error("Это воспоминание нельзя применить к текущему разбору.");
  }
  const chain: SituationChain = {
    trigger: pattern.trigger,
    thought: pattern.thought,
    emotionBody: pattern.emotion_body,
    urge: pattern.urge,
    action: pattern.action,
    consequences: pattern.consequences,
  };
  const hypothesis = buildChainHypothesis(session, chain);
  await getRawDb().prepare(
    "UPDATE conversation_analysis_sessions SET stage='chain_confirm',chain_json=?,hypothesis=?,memory_dismissed=1,updated_at=? WHERE id=? AND user_id=? AND status='pending'",
  ).bind(JSON.stringify(chain), hypothesis, new Date().toISOString(), session.id, session.user_id).run();
  return `Возьмём прошлую цепочку как черновик и не будем повторять все вопросы. Проверьте, подходит ли она к текущему эпизоду.\n\n${hypothesis}`;
}

export async function saveSituationHypothesis(id: string, clarification: string, hypothesis: string) {
  await getRawDb().prepare("UPDATE conversation_analysis_sessions SET stage='confirm',clarification=?,hypothesis=?,updated_at=? WHERE id=? AND status='pending'")
    .bind(clarification, hypothesis, new Date().toISOString(), id).run();
}

export async function requestSituationCorrection(session: SituationAnalysisSession) {
  const stage = session.analysis_depth === "complex" ? "chain_edit_choose" : "correct";
  await getRawDb().prepare("UPDATE conversation_analysis_sessions SET stage=?,updated_at=? WHERE id=? AND status='pending'")
    .bind(stage, new Date().toISOString(), session.id).run();
}

export async function completeSituationAnalysis(id: string) {
  await getRawDb().prepare("UPDATE conversation_analysis_sessions SET status='completed',updated_at=? WHERE id=?")
    .bind(new Date().toISOString(), id).run();
}
