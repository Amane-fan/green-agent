// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function styles() {
  return readFileSync('src/styles.css', 'utf8');
}

function cssBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm').exec(source);
  return match?.[1] ?? '';
}

describe('frontend light theme styles', () => {
  it('uses light workbench surfaces instead of dark glass backgrounds', () => {
    const source = styles();

    expect(cssBlock(source, 'body')).toContain('#f6fbf7');
    expect(cssBlock(source, '.hero-panel')).toContain('background: #ffffff');
    expect(cssBlock(source, '.status-card,\n.control-panel,\n.insight-panel,\n.map-card')).toContain(
      'background: #ffffff',
    );
    expect(source).not.toContain('background: rgba(15, 23, 42, 0.64)');
    expect(source).not.toContain('background: rgba(8, 17, 13, 0.8)');
  });

  it('keeps controls, route cards, and assistant content readable on light surfaces', () => {
    const source = styles();

    expect(cssBlock(source, 'input')).toContain('color: #17352a');
    expect(cssBlock(source, 'input')).toContain('background: #ffffff');
    expect(cssBlock(source, '.route-card')).toContain('color: #17352a');
    expect(cssBlock(source, '.planning-assistant-panel')).toContain('background: #ffffff');
    expect(cssBlock(source, '.planning-assistant-message-body,\n.planning-assistant-markdown')).toContain(
      'color: #17352a',
    );
    expect(source).not.toContain('background: rgba(2, 6, 23, 0.52)');
    expect(source).not.toContain('background: rgba(15, 23, 42, 0.78)');
  });
});
