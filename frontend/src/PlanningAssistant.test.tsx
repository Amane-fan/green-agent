import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamPlanningAssistantChat } from './api';
import PlanningAssistant from './PlanningAssistant';
import type { AIAssistantStreamEvent } from './types';

vi.mock('./api', () => ({
  streamPlanningAssistantChat: vi.fn(),
}));

const streamMock = vi.mocked(streamPlanningAssistantChat);

function mockSuccessfulStream(chunks: string[]) {
  streamMock.mockImplementation(async (_request, onEvent) => {
    for (const chunk of chunks) {
      onEvent({ delta: chunk });
    }
    onEvent({ done: true });
  });
}

async function openAssistant() {
  await userEvent.click(screen.getByRole('button', { name: '打开 AI 助手' }));
}

async function ask(question: string) {
  const input = screen.getByLabelText('向 AI 助手提问');
  await userEvent.clear(input);
  await userEvent.type(input, question);
  await userEvent.click(screen.getByRole('button', { name: '发送问题' }));
}

describe('PlanningAssistant', () => {
  beforeEach(() => {
    streamMock.mockReset();
  });

  it('opens, closes, and preserves page-local messages while closed', async () => {
    mockSuccessfulStream(['回答保留']);
    render(<PlanningAssistant recordId={1} resetKey="record-1" />);

    await openAssistant();
    await ask('这次规划怎么样？');
    expect(await screen.findByText('回答保留')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '关闭 AI 助手' }));
    expect(screen.queryByRole('dialog', { name: 'AI 规划助手' })).not.toBeInTheDocument();

    await openAssistant();
    expect(screen.getByText('这次规划怎么样？')).toBeInTheDocument();
    expect(screen.getByText('回答保留')).toBeInTheDocument();
  });

  it('prompts for a planning result and does not send without record id', async () => {
    render(<PlanningAssistant recordId={null} resetKey="none" />);

    await openAssistant();

    expect(screen.getByText('请先执行或恢复路线规划，再向 AI 助手提问。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送问题' })).toBeDisabled();
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('appends multiple stream chunks to one assistant message', async () => {
    mockSuccessfulStream(['第一段', '第二段']);
    render(<PlanningAssistant recordId={3} resetKey="record-3" />);

    await openAssistant();
    await ask('总结当前规划');

    expect(await screen.findByText('第一段第二段')).toBeInTheDocument();
  });

  it('renders assistant markdown as structured content', async () => {
    mockSuccessfulStream([
      '## 路线总结\n\n- **vehicle-1** 距离最长\n- 未分配任务：`bin-3`\n\n```text\n总距离 10.00 km\n```',
    ]);
    render(<PlanningAssistant recordId={3} resetKey="record-3" />);

    await openAssistant();
    await ask('用 Markdown 总结当前规划');

    expect(await screen.findByRole('heading', { name: '路线总结' })).toBeInTheDocument();
    expect(screen.getByText('vehicle-1')).toBeInTheDocument();
    expect(screen.getByText('vehicle-1').tagName).toBe('STRONG');
    expect(screen.getByText(/距离最长/).closest('li')).toBeInTheDocument();
    expect(screen.getByText('bin-3').tagName).toBe('CODE');
    expect(screen.getByText(/总距离 10.00 km/).tagName).toBe('CODE');
  });

  it('sends recent page-local history with the next question', async () => {
    streamMock
      .mockImplementationOnce(async (_request, onEvent) => {
        onEvent({ delta: '第一轮回答' });
        onEvent({ done: true });
      })
      .mockImplementationOnce(async (_request, onEvent) => {
        onEvent({ delta: '第二轮回答' });
        onEvent({ done: true });
      });
    render(<PlanningAssistant recordId={4} resetKey="record-4" />);

    await openAssistant();
    await ask('哪辆车最忙？');
    expect(await screen.findByText('第一轮回答')).toBeInTheDocument();
    await ask('它为什么最忙？');

    const secondRequest = streamMock.mock.calls[1][0];
    expect(secondRequest.messages).toEqual([
      { role: 'user', content: '哪辆车最忙？' },
      { role: 'assistant', content: '第一轮回答' },
      { role: 'user', content: '它为什么最忙？' },
    ]);
    expect(await screen.findByText('第二轮回答')).toBeInTheDocument();
  });

  it('disables duplicate submit while streaming and allows sending again after failure', async () => {
    let finishStream: ((event?: AIAssistantStreamEvent) => void) | undefined;
    streamMock
      .mockImplementationOnce(
        (_request, onEvent) =>
          new Promise<void>((resolve) => {
            finishStream = (event = { done: true }) => {
              onEvent(event);
              resolve();
            };
          }),
      )
      .mockRejectedValueOnce(new Error('模型暂不可用'))
      .mockImplementationOnce(async (_request, onEvent) => {
        onEvent({ delta: '恢复后的回答' });
        onEvent({ done: true });
      });
    render(<PlanningAssistant recordId={5} resetKey="record-5" />);

    await openAssistant();
    await ask('先问一个问题');
    const sendButton = screen.getByRole('button', { name: '发送问题' });
    expect(sendButton).toBeDisabled();
    await userEvent.click(sendButton);
    expect(streamMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishStream?.();
    });
    await waitFor(() => expect(screen.getByLabelText('向 AI 助手提问')).not.toBeDisabled());

    await ask('失败问题');
    expect(await screen.findByText('模型暂不可用')).toBeInTheDocument();

    await ask('重新提问');
    expect(await screen.findByText('恢复后的回答')).toBeInTheDocument();
  });

  it('clears messages when the planning context key changes', async () => {
    mockSuccessfulStream(['旧规划回答']);
    const { rerender } = render(<PlanningAssistant recordId={6} resetKey="record-6" />);

    await openAssistant();
    await ask('旧规划问题');
    expect(await screen.findByText('旧规划回答')).toBeInTheDocument();

    rerender(<PlanningAssistant recordId={7} resetKey="record-7" />);

    expect(screen.queryByText('旧规划问题')).not.toBeInTheDocument();
    expect(screen.queryByText('旧规划回答')).not.toBeInTheDocument();
  });

  it('defines fixed overlay and internal message scrolling styles', () => {
    const styles = readFileSync('src/styles.css', 'utf8');

    expect(styles).toContain('.planning-assistant-shell');
    expect(styles).toContain('position: fixed');
    expect(styles).toContain('.planning-assistant-messages');
    expect(styles).toContain('overflow-y: auto');
    expect(styles).toContain('max-height');
  });
});
