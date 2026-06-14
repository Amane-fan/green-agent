import type {
  AIAssistantChatRequest,
  AIAssistantStreamEvent,
  PlanningRecordDetail,
  PlanningRecordRestoreResponse,
  PlanningRecordSummary,
  PlanningResult,
  Scenario,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(JSON.stringify(detail.detail ?? detail));
  }
  return response.json() as Promise<T>;
}

export function loadCurrentScenario(): Promise<Scenario> {
  return request<Scenario>('/api/scenarios/current');
}

export function generateRandomScenario(seed: number): Promise<Scenario> {
  return request<Scenario>('/api/scenarios/random', {
    method: 'POST',
    body: JSON.stringify({ seed }),
  });
}

export function saveScenario(scenario: Scenario): Promise<Scenario> {
  return request<Scenario>('/api/scenarios/current', {
    method: 'PUT',
    body: JSON.stringify(scenario),
  });
}

export function advanceSimulationTime(steps: number): Promise<Scenario> {
  return request<Scenario>('/api/simulation/advance', {
    method: 'POST',
    body: JSON.stringify({ steps }),
  });
}

export function planRoutes(seed: number, threshold: number): Promise<PlanningResult> {
  return request<PlanningResult>('/api/planning/routes', {
    method: 'POST',
    body: JSON.stringify({ seed, threshold }),
  });
}

export function listPlanningRecords(): Promise<PlanningRecordSummary[]> {
  return request<PlanningRecordSummary[]>('/api/planning-records');
}

export function loadPlanningRecord(recordId: number): Promise<PlanningRecordDetail> {
  return request<PlanningRecordDetail>(`/api/planning-records/${recordId}`);
}

export function renamePlanningRecord(
  recordId: number,
  title: string,
): Promise<PlanningRecordSummary> {
  return request<PlanningRecordSummary>(`/api/planning-records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function restorePlanningRecord(recordId: number): Promise<PlanningRecordRestoreResponse> {
  return request<PlanningRecordRestoreResponse>(`/api/planning-records/${recordId}/restore`, {
    method: 'POST',
  });
}

export async function streamPlanningAssistantChat(
  payload: AIAssistantChatRequest,
  onEvent: (event: AIAssistantStreamEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/ai-assistant/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(String(detail.detail ?? detail));
  }
  if (!response.body) {
    throw new Error('AI 助手响应流不可用');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      buffer = parseSseBuffer(buffer, onEvent);
    }
    if (done) {
      buffer += decoder.decode();
      parseSseBuffer(`${buffer}\n\n`, onEvent);
      break;
    }
  }
}

function parseSseBuffer(
  buffer: string,
  onEvent: (event: AIAssistantStreamEvent) => void,
): string {
  const frames = buffer.split(/\n\n/);
  const remainder = frames.pop() ?? '';

  for (const frame of frames) {
    const dataLines = frame
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''));
    if (dataLines.length === 0) {
      continue;
    }
    const raw = dataLines.join('\n');
    if (raw === '[DONE]') {
      onEvent({ done: true });
      continue;
    }
    const event = JSON.parse(raw) as AIAssistantStreamEvent;
    if (event.error) {
      throw new Error(event.error);
    }
    onEvent(event);
  }

  return remainder;
}
