import { FormEvent, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { streamPlanningAssistantChat } from './api';
import type { AIAssistantMessage, AIAssistantRole } from './types';

interface PlanningAssistantProps {
  recordId?: number | null;
  resetKey: string;
}

interface LocalMessage {
  id: string;
  role: AIAssistantRole;
  content: string;
  status?: 'streaming' | 'error';
}

export default function PlanningAssistant({ recordId, resetKey }: PlanningAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const nextMessageId = useRef(0);
  const activeRequestId = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRequestId.current += 1;
    setMessages([]);
    setInput('');
    setError(null);
    setSending(false);
  }, [resetKey]);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'end' });
    }
  }, [messages, isOpen]);

  function makeMessage(role: AIAssistantRole, content: string, status?: LocalMessage['status']) {
    nextMessageId.current += 1;
    return {
      id: `${Date.now()}-${nextMessageId.current}`,
      role,
      content,
      status,
    };
  }

  function recentMessages(nextUserMessage: AIAssistantMessage): AIAssistantMessage[] {
    return [
      ...messages
        .filter((message) => message.content.trim())
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      nextUserMessage,
    ].slice(-12);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || sending) {
      return;
    }
    if (!recordId) {
      setError('请先执行或恢复路线规划，再向 AI 助手提问。');
      return;
    }

    const userMessage = makeMessage('user', question);
    const assistantMessage = makeMessage('assistant', '', 'streaming');
    const requestMessages = recentMessages({ role: 'user', content: question });
    const requestId = activeRequestId.current + 1;
    activeRequestId.current = requestId;

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput('');
    setError(null);
    setSending(true);

    try {
      await streamPlanningAssistantChat(
        {
          record_id: recordId,
          messages: requestMessages,
        },
        (streamEvent) => {
          if (activeRequestId.current !== requestId) {
            return;
          }
          if (streamEvent.delta) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: message.content + streamEvent.delta }
                  : message,
              ),
            );
          }
          if (streamEvent.done) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id ? { ...message, status: undefined } : message,
              ),
            );
          }
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 助手调用失败';
      if (activeRequestId.current === requestId) {
        setError(message);
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessage.id
              ? {
                  ...item,
                  content: item.content || '回复生成失败',
                  status: 'error',
                }
              : item,
          ),
        );
      }
    } finally {
      if (activeRequestId.current === requestId) {
        setSending(false);
      }
    }
  }

  return (
    <div className="planning-assistant-shell">
      {isOpen && (
        <section className="planning-assistant-panel" role="dialog" aria-label="AI 规划助手">
          <header className="planning-assistant-header">
            <div>
              <span className="planning-assistant-kicker">AI Assistant</span>
              <h2>规划助手</h2>
            </div>
            <button
              type="button"
              className="planning-assistant-icon-button"
              aria-label="关闭 AI 助手"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </header>

          {!recordId && (
            <p className="planning-assistant-notice">
              请先执行或恢复路线规划，再向 AI 助手提问。
            </p>
          )}

          <div className="planning-assistant-messages" aria-live="polite">
            {messages.length === 0 ? (
              <p className="planning-assistant-empty">可询问路线差异、未分配原因或总体指标。</p>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`planning-assistant-message planning-assistant-message-${message.role}`}
                  data-status={message.status}
                >
                  <span className="planning-assistant-message-role">
                    {message.role === 'user' ? '我' : 'AI'}
                  </span>
                  {message.role === 'assistant' ? (
                    <div className="planning-assistant-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ node: _node, ...props }) => (
                            <a {...props} target="_blank" rel="noreferrer" />
                          ),
                        }}
                      >
                        {message.content || '生成中...'}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="planning-assistant-message-body">
                      {message.content || '生成中...'}
                    </p>
                  )}
                </article>
              ))
            )}
            <div ref={endRef} />
          </div>

          {error && <p className="planning-assistant-error">{error}</p>}

          <form className="planning-assistant-form" onSubmit={handleSubmit}>
            <label>
              向 AI 助手提问
              <textarea
                value={input}
                disabled={!recordId || sending}
                rows={3}
                onChange={(event) => setInput(event.target.value)}
                placeholder={recordId ? '例如：为什么这辆车路线最长？' : '请先规划路线'}
              />
            </label>
            <button type="submit" disabled={!recordId || sending || !input.trim()} aria-label="发送问题">
              发送
            </button>
          </form>
          <span className="planning-assistant-status" role="status">
            {sending ? 'AI 助手正在回答' : ''}
          </span>
        </section>
      )}

      <button
        type="button"
        className="planning-assistant-launch"
        aria-label="打开 AI 助手"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        AI
      </button>
    </div>
  );
}
