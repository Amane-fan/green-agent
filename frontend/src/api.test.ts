import { describe, expect, it, vi } from 'vitest';

import { streamPlanningAssistantChat } from './api';
import type { AIAssistantStreamEvent } from './types';

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      headers: { 'Content-Type': 'text/event-stream' },
    },
  );
}

describe('streamPlanningAssistantChat', () => {
  it('posts chat messages and emits parsed SSE events', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"delta":"第一段"}\n\n',
        'data: {"delta":"第二段"}\n\n',
        'data: {"done":true}\n\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: AIAssistantStreamEvent[] = [];

    await streamPlanningAssistantChat(
      {
        record_id: 7,
        messages: [{ role: 'user', content: '总结当前规划' }],
      },
      (event) => events.push(event),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai-assistant/chat/stream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          record_id: 7,
          messages: [{ role: 'user', content: '总结当前规划' }],
        }),
      }),
    );
    expect(events).toEqual([{ delta: '第一段' }, { delta: '第二段' }, { done: true }]);
  });

  it('throws a readable error for HTTP failures and SSE error events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ detail: 'AI assistant configuration is missing' }, { status: 503 }),
      ),
    );

    await expect(
      streamPlanningAssistantChat(
        { record_id: 7, messages: [{ role: 'user', content: '问题' }] },
        () => {},
      ),
    ).rejects.toThrow('AI assistant configuration is missing');

    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"error":"模型失败"}\n\n'])));

    await expect(
      streamPlanningAssistantChat(
        { record_id: 7, messages: [{ role: 'user', content: '问题' }] },
        () => {},
      ),
    ).rejects.toThrow('模型失败');
  });
});
