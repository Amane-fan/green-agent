import type { PlanningResult, Scenario } from './types';

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
