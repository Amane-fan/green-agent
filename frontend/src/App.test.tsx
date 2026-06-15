import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const leafletMockState = vi.hoisted(() => ({
  handlers: {} as {
    click?: (event: { latlng: { lat: number; lng: number } }) => void;
  },
  clickLatLng: { lat: 31.246, lng: 121.486 },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div
      data-testid="leaflet-map"
      onClick={() => leafletMockState.handlers.click?.({ latlng: leafletMockState.clickLatLng })}
    >
      {children}
    </div>
  ),
  TileLayer: ({ url }: { url: string }) => <div data-testid="tile-layer" data-url={url} />,
  Polyline: ({
    children,
    positions,
    pathOptions,
  }: {
    children?: ReactNode;
    positions: [number, number][];
    pathOptions?: {
      className?: string;
      color?: string;
      dashArray?: string;
      opacity?: number;
      weight?: number;
    };
  }) => {
    const className = pathOptions?.className ?? '';
    const testId = className.includes('selected-route-segment')
      ? 'route-polyline'
      : 'graph-polyline';

    return (
      <div
        data-testid={testId}
        data-class-name={className}
        data-color={pathOptions?.color}
        data-dash-array={pathOptions?.dashArray}
        data-opacity={pathOptions?.opacity}
        data-positions={JSON.stringify(positions)}
        data-weight={pathOptions?.weight}
      >
        {children}
      </div>
    );
  },
  CircleMarker: ({
    children,
    center,
    pathOptions,
    radius,
  }: {
    children?: ReactNode;
    center: [number, number];
    pathOptions?: {
      className?: string;
      color?: string;
      fillColor?: string;
      fillOpacity?: number;
      weight?: number;
    };
    radius?: number;
  }) => (
    <div
      data-testid="circle-marker"
      data-center={JSON.stringify(center)}
      data-class-name={pathOptions?.className ?? ''}
      data-color={pathOptions?.color}
      data-fill-color={pathOptions?.fillColor}
      data-radius={radius}
      data-weight={pathOptions?.weight}
    >
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMapEvents: (
    handlers: {
      click?: (event: { latlng: { lat: number; lng: number } }) => void;
    },
  ) => {
    leafletMockState.handlers = handlers;
    return null;
  },
}));

const scenarioPayload = {
  id: 'scenario-1',
  name: 'demo',
  current_time: 0,
  nodes: [
    {
      id: 'bin-1',
      type: 'bin',
      lat: 31.23,
      lng: 121.47,
      waste_type: 'kitchen',
      fill_rate: 82,
      capacity: 10,
      fill_trend: { kind: 'linear', rate_per_step: 2 },
    },
    {
      id: 'bin-pass-through',
      type: 'bin',
      lat: 31.225,
      lng: 121.465,
      waste_type: 'kitchen',
      fill_rate: 45,
      capacity: 10,
      fill_trend: { kind: 'linear', rate_per_step: 1 },
    },
    { id: 'vehicle-node-1', type: 'vehicle', lat: 31.22, lng: 121.46 },
    { id: 'facility-node-1', type: 'facility', lat: 31.21, lng: 121.45 },
  ],
  edges: [
    { source: 'vehicle-node-1', target: 'bin-pass-through', weight: 0.5 },
    { source: 'bin-pass-through', target: 'bin-1', weight: 0.7 },
    { source: 'bin-1', target: 'facility-node-1', weight: 2.3 },
  ],
  vehicles: [
    {
      id: 'vehicle-1',
      node_id: 'vehicle-node-1',
      supported_waste_type: 'kitchen',
      capacity: 50,
      fuel_per_km: 0.2,
      color: '#16a34a',
    },
  ],
  facilities: [
    {
      id: 'facility-1',
      node_id: 'facility-node-1',
      accepted_waste_types: ['kitchen'],
      capacity: 200,
    },
  ],
  validation: { is_valid: true, disconnected_nodes: [], warnings: [] },
};

const planPayload = {
  record_id: 1,
  routes: [
    {
      vehicle_id: 'vehicle-1',
      color: '#16a34a',
      facility_id: 'facility-1',
      stops: [
        { node_id: 'bin-1', node_type: 'bin', order: 1, fill_rate: 82 },
        { node_id: 'facility-node-1', node_type: 'facility', order: 2 },
      ],
      path_node_ids: ['vehicle-node-1', 'bin-pass-through', 'bin-1', 'facility-node-1'],
      distance: 3.5,
      estimated_fuel: 0.7,
      estimated_carbon: 1.61,
    },
  ],
  unassigned_tasks: [],
  total_distance: 3.5,
  estimated_fuel: 0.7,
  estimated_carbon: 1.61,
  warnings: [],
  trace: [{ agent: 'monitoring', message: 'found 1 eligible bin' }],
};

const overlappingPlanPayload = {
  ...planPayload,
  routes: [
    planPayload.routes[0],
    {
      ...planPayload.routes[0],
      vehicle_id: 'vehicle-2',
      color: '#dc2626',
    },
  ],
};

const historyScenarioPayload = {
  ...scenarioPayload,
  id: 'scenario-history',
  name: '历史记录场景',
  current_time: 4,
  nodes: [
    {
      id: 'history-bin-1',
      type: 'bin',
      lat: 31.24,
      lng: 121.49,
      waste_type: 'recyclable',
      fill_rate: 91,
      capacity: 10,
      fill_trend: { kind: 'linear', rate_per_step: 1 },
    },
    { id: 'history-vehicle-node-1', type: 'vehicle', lat: 31.235, lng: 121.485 },
    { id: 'history-facility-node-1', type: 'facility', lat: 31.23, lng: 121.48 },
  ],
  edges: [
    { source: 'history-vehicle-node-1', target: 'history-bin-1', weight: 1.2 },
    { source: 'history-bin-1', target: 'history-facility-node-1', weight: 3.0 },
  ],
  vehicles: [
    {
      id: 'history-vehicle-1',
      node_id: 'history-vehicle-node-1',
      supported_waste_type: 'recyclable',
      capacity: 50,
      fuel_per_km: 0.3,
      color: '#2563eb',
    },
  ],
  facilities: [
    {
      id: 'history-facility-1',
      node_id: 'history-facility-node-1',
      accepted_waste_types: ['recyclable'],
      capacity: 200,
    },
  ],
  validation: { is_valid: true, disconnected_nodes: [], warnings: [] },
};

const historyPlanPayload = {
  record_id: 42,
  routes: [
    {
      vehicle_id: 'history-vehicle-1',
      color: '#2563eb',
      facility_id: 'history-facility-1',
      stops: [
        { node_id: 'history-bin-1', node_type: 'bin', order: 1, fill_rate: 91 },
        { node_id: 'history-facility-node-1', node_type: 'facility', order: 2 },
      ],
      path_node_ids: ['history-vehicle-node-1', 'history-bin-1', 'history-facility-node-1'],
      distance: 4.2,
      estimated_fuel: 1.26,
      estimated_carbon: 2.91,
    },
  ],
  unassigned_tasks: [],
  total_distance: 4.2,
  estimated_fuel: 1.26,
  estimated_carbon: 2.91,
  warnings: [],
  trace: [{ agent: 'monitoring', message: 'restored 1 eligible bin' }],
};

const historyRecordSummary = {
  id: 42,
  title: '历史规划 A',
  scenario_id: 'scenario-history',
  scenario_name: '历史记录场景',
  simulation_time: 4,
  seed: 202612,
  threshold: 70,
  route_count: 1,
  total_distance: 4.2,
  estimated_fuel: 1.26,
  estimated_carbon: 2.91,
  created_at: '2026-06-14T00:00:00Z',
};

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

function installFetchMock(
  planningResponse = planPayload,
  options: {
    records?: typeof historyRecordSummary[];
    recordsAfterPlan?: typeof historyRecordSummary[];
    restoreResponse?: {
      record: typeof historyRecordSummary;
      scenario: typeof historyScenarioPayload;
      plan: typeof historyPlanPayload;
    };
  } = {},
) {
  let hasPlanned = false;
  let records = [...(options.records ?? [])];
  let recordsAfterPlan = options.recordsAfterPlan ? [...options.recordsAfterPlan] : undefined;

  function recordForUrl(url: string) {
    const id = Number(url.match(/\/api\/planning-records\/(\d+)/)?.[1] ?? historyRecordSummary.id);
    return (
      (hasPlanned && recordsAfterPlan ? recordsAfterPlan : records).find((record) => record.id === id) ?? {
        ...historyRecordSummary,
        id,
      }
    );
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/ai-assistant/chat/stream')) {
      const payload = JSON.parse(String(init?.body));
      const isFollowUp = payload.messages.length > 1;
      return sseResponse(
        isFollowUp
          ? ['data: {"delta":"第二轮回答"}\n\n', 'data: {"done":true}\n\n']
          : ['data: {"delta":"第一段"}\n\n', 'data: {"delta":"第二段"}\n\n', 'data: {"done":true}\n\n'],
      );
    }
    if (url.includes('/api/planning-records/') && init?.method === 'PATCH') {
      const payload = JSON.parse(String(init.body));
      const currentRecord = recordForUrl(url);
      const renamed = { ...currentRecord, title: payload.title };
      records = records.map((record) => (record.id === renamed.id ? renamed : record));
      recordsAfterPlan = recordsAfterPlan?.map((record) =>
        record.id === renamed.id ? renamed : record,
      );
      return Response.json(renamed);
    }
    if (url.includes('/api/planning-records/') && url.includes('/restore')) {
      const record = recordForUrl(url);
      return Response.json(
        options.restoreResponse ?? {
          record,
          scenario: historyScenarioPayload,
          plan: historyPlanPayload,
        },
      );
    }
    if (url.includes('/api/planning-records/')) {
      const summary = recordForUrl(url);
      return Response.json({
        summary,
        scenario: historyScenarioPayload,
        plan: historyPlanPayload,
      });
    }
    if (url.includes('/api/planning-records')) {
      return Response.json(hasPlanned && recordsAfterPlan ? recordsAfterPlan : records);
    }
    if (url.includes('/api/scenarios/current') && init?.method === 'PUT') {
      const payload = JSON.parse(String(init.body));
      return Response.json({
        ...payload,
        validation: { is_valid: false, disconnected_nodes: [], warnings: [] },
      });
    }
    if (url.includes('/api/scenarios/random')) {
      return Response.json(scenarioPayload);
    }
    if (url.includes('/api/simulation/advance')) {
      return Response.json({ ...scenarioPayload, current_time: 1 });
    }
    if (url.includes('/api/planning/routes')) {
      hasPlanned = true;
      return Response.json(planningResponse);
    }
    return Response.json(scenarioPayload);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('App', () => {
  beforeEach(() => {
    leafletMockState.handlers = {};
    window.history.pushState({}, '', '/');
  });

  it('renders scenario layers and random generation controls', async () => {
    installFetchMock();

    render(<App />);

    await screen.findByText('绿运先锋');
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));

    expect(await screen.findByText('垃圾桶: 2')).toBeInTheDocument();
    expect(screen.getByText('车辆: 1')).toBeInTheDocument();
    expect(screen.getByText('处理厂: 1')).toBeInTheDocument();
    expect(screen.getByText('图状态: 可规划')).toBeInTheDocument();
    expect(screen.getByTestId('tile-layer')).toHaveAttribute(
      'data-url',
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    );
  });

  it('shows a history entry point and current planning title after a successful plan', async () => {
    installFetchMock(
      { ...planPayload, record_id: 42 },
      { records: [], recordsAfterPlan: [historyRecordSummary] },
    );

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    expect(await screen.findByText('历史规划 A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看规划历史' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看规划记录 42' })).not.toBeInTheDocument();
  });

  it('renders base graph edges with stronger non-directional styling', async () => {
    installFetchMock();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));

    const graphEdge = screen.getAllByTestId('graph-polyline')[0];

    expect(graphEdge).toHaveAttribute('data-class-name', 'graph-edge');
    expect(graphEdge).toHaveAttribute('data-color', '#64748b');
    expect(graphEdge).toHaveAttribute('data-weight', '3');
    expect(graphEdge).toHaveAttribute('data-opacity', '0.85');
    expect(graphEdge).not.toHaveAttribute('data-dash-array');
    expect(graphEdge.getAttribute('data-class-name')).not.toContain('selected-route-flow');
  });

  it('advances time and displays planned route metrics', async () => {
    installFetchMock();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(await screen.findByRole('button', { name: '推进时间' }));
    await waitFor(() => expect(screen.getByText('模拟时间: 1')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    expect(await screen.findByText('总距离: 3.50 km')).toBeInTheDocument();
    const routeCard = screen.getByRole('button', { name: '选择路线 vehicle-1' });
    expect(within(routeCard).getByText('vehicle-1')).toBeInTheDocument();
    expect(within(routeCard).getByText('起点 vehicle-node-1')).toBeInTheDocument();
    expect(within(routeCard).getByText('1 回收 bin-1 · 82%')).toBeInTheDocument();
    expect(within(routeCard).getByText('终点 facility-node-1')).toBeInTheDocument();
    expect(within(routeCard).queryByText(/bin-pass-through/)).not.toBeInTheDocument();
  });

  it('emphasizes the selected route vehicle start and collection bins without promoting pass-through bins', async () => {
    installFetchMock();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    await screen.findByText('vehicle-1');
    const markers = screen.getAllByTestId('circle-marker');
    const startMarker = markers.find((marker) => marker.textContent?.includes('vehicle-node-1'));
    const collectionMarker = markers.find((marker) => marker.textContent?.includes('bin-1'));
    const passThroughMarker = markers.find((marker) =>
      marker.textContent?.includes('bin-pass-through'),
    );

    expect(startMarker).toHaveAttribute('data-class-name', 'selected-route-start-marker');
    expect(startMarker).toHaveAttribute('data-color', '#16a34a');
    expect(startMarker).toHaveAttribute('data-radius', '12');
    expect(collectionMarker).toHaveAttribute('data-class-name', 'selected-route-task-marker');
    expect(collectionMarker).toHaveAttribute('data-color', '#16a34a');
    expect(collectionMarker).toHaveAttribute('data-radius', '11');
    expect(collectionMarker).toHaveTextContent('回收顺序: 1');
    expect(passThroughMarker).toHaveAttribute('data-class-name', '');
    expect(passThroughMarker).toHaveAttribute('data-radius', '7');
    expect(passThroughMarker).not.toHaveTextContent('回收顺序');
  });

  it('selects the first planned route by default and only highlights that route', async () => {
    installFetchMock(overlappingPlanPayload);

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    const firstRouteCard = await screen.findByRole('button', { name: '选择路线 vehicle-1' });
    const secondRouteCard = screen.getByRole('button', { name: '选择路线 vehicle-2' });
    const routeLines = screen.getAllByTestId('route-polyline');

    expect(firstRouteCard).toHaveAttribute('aria-pressed', 'true');
    expect(secondRouteCard).toHaveAttribute('aria-pressed', 'false');
    expect(routeLines).toHaveLength(3);
    expect(routeLines.every((line) => line.getAttribute('data-color') === '#16a34a')).toBe(true);
  });

  it('renders selected route segments as directional flowing dashed lines', async () => {
    installFetchMock(overlappingPlanPayload);

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    await screen.findByRole('button', { name: '选择路线 vehicle-1' });
    const routeLines = screen.getAllByTestId('route-polyline');
    const graphLines = screen.getAllByTestId('graph-polyline');

    expect(routeLines).toHaveLength(3);
    expect(
      routeLines.every((line) =>
        line.getAttribute('data-class-name')?.includes('selected-route-flow'),
      ),
    ).toBe(true);
    expect(routeLines.every((line) => line.getAttribute('data-dash-array') === '10 8')).toBe(
      true,
    );
    const firstSegmentPositions = JSON.parse(routeLines[0].getAttribute('data-positions') ?? '[]');
    expect(firstSegmentPositions[0]).toEqual([31.22, 121.46]);
    expect(firstSegmentPositions.at(-1)).toEqual([31.225, 121.465]);
    expect(graphLines.every((line) => !line.getAttribute('data-class-name')?.includes('flow'))).toBe(
      true,
    );
  });

  it('navigates from the history page to restore a planning record as the current map and plan', async () => {
    const fetchMock = installFetchMock(planPayload, { records: [historyRecordSummary] });
    window.history.pushState({}, '', '/history');

    render(<App />);
    const historyCard = await screen.findByRole('button', { name: '查看规划记录 42' });
    expect(within(historyCard).getByText('历史规划 A')).toBeInTheDocument();
    expect(within(historyCard).getByText('场景 历史记录场景')).toBeInTheDocument();
    expect(within(historyCard).getByText('模拟时间 4')).toBeInTheDocument();
    expect(within(historyCard).getByText('路线 1')).toBeInTheDocument();
    expect(within(historyCard).getByText('4.20 km / 1.26 L / 2.91 kg')).toBeInTheDocument();

    await userEvent.click(historyCard);

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?record_id=42');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/planning-records/42/restore',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('模拟时间: 4')).toBeInTheDocument();
    expect(screen.getByText('总距离: 4.20 km')).toBeInTheDocument();
    const routeCard = screen.getByRole('button', { name: '选择路线 history-vehicle-1' });
    expect(routeCard).toHaveAttribute('aria-pressed', 'true');
    expect(within(routeCard).getByText('1 回收 history-bin-1 · 91%')).toBeInTheDocument();
    expect(screen.getAllByTestId('route-polyline')).toHaveLength(2);
    expect(screen.getAllByTestId('route-polyline')[0]).toHaveAttribute('data-color', '#2563eb');
    expect(
      screen
        .getAllByTestId('circle-marker')
        .some((marker) => marker.textContent?.includes('history-bin-1')),
    ).toBe(true);
  });

  it('restores a planning history record from a direct record link', async () => {
    const fetchMock = installFetchMock(planPayload, { records: [historyRecordSummary] });
    window.history.pushState({}, '', '/?record_id=42');

    render(<App />);

    expect(await screen.findByText('历史规划 A')).toBeInTheDocument();
    expect(screen.getByText('模拟时间: 4')).toBeInTheDocument();
    expect(screen.getByText('总距离: 4.20 km')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/planning-records/42/restore',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('renames a planning record inline on the history page without restoring it', async () => {
    const fetchMock = installFetchMock(planPayload, { records: [historyRecordSummary] });
    window.history.pushState({}, '', '/history');

    render(<App />);
    const historyCard = await screen.findByRole('button', { name: '查看规划记录 42' });

    await userEvent.click(within(historyCard).getByRole('button', { name: '重命名规划记录 42' }));
    const titleInput = screen.getByLabelText('规划结果名称');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '周末清运方案');
    await userEvent.click(screen.getByRole('button', { name: '保存规划记录 42' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/planning-records/42',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: '周末清运方案' }),
      }),
    );
    expect(await screen.findByText('周末清运方案')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/history');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/planning-records/42/restore',
      expect.anything(),
    );
  });

  it('clears a restored planning result when simulation advances', async () => {
    installFetchMock(planPayload, { records: [historyRecordSummary] });
    window.history.pushState({}, '', '/?record_id=42');

    render(<App />);
    expect(await screen.findByText('总距离: 4.20 km')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '推进时间' }));

    await waitFor(() => expect(screen.queryByText('总距离: 4.20 km')).not.toBeInTheDocument());
    expect(screen.getByText('生成场景并点击规划路线后，这里会显示多车辆路径和指标。')).toBeInTheDocument();
  });

  it('defines CSS for selected route flow and reduced-motion fallback', () => {
    const styles = readFileSync('src/styles.css', 'utf8');

    expect(styles).toContain('.selected-route-flow');
    expect(styles).toContain('stroke-dasharray: 10 8');
    expect(styles).toContain('@keyframes route-flow');
    expect(styles).toContain('stroke-dashoffset');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('animation: none');
  });

  it('defines CSS for single-screen home layout and route result scroll window', () => {
    const styles = readFileSync('src/styles.css', 'utf8');

    expect(styles).toContain('height: 100vh');
    expect(styles).toContain('overflow: hidden');
    expect(styles).toContain('.panel-scroll');
    expect(styles).toContain('overflow-y: auto');
    expect(styles).toContain('.route-scroll-window');
  });

  it('updates the selected route card and highlighted map route when another route is selected', async () => {
    installFetchMock(overlappingPlanPayload);

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    const firstRouteCard = await screen.findByRole('button', { name: '选择路线 vehicle-1' });
    const secondRouteCard = screen.getByRole('button', { name: '选择路线 vehicle-2' });
    const firstRoutePositions = screen
      .getAllByTestId('route-polyline')
      .map((line) => line.getAttribute('data-positions'));

    await userEvent.click(secondRouteCard);

    const secondRouteLines = screen.getAllByTestId('route-polyline');
    const secondRoutePositions = secondRouteLines.map((line) =>
      line.getAttribute('data-positions'),
    );

    expect(firstRouteCard).toHaveAttribute('aria-pressed', 'false');
    expect(secondRouteCard).toHaveAttribute('aria-pressed', 'true');
    expect(secondRouteLines).toHaveLength(3);
    expect(secondRouteLines.every((line) => line.getAttribute('data-color') === '#dc2626')).toBe(
      true,
    );
    expect(secondRoutePositions).not.toEqual(firstRoutePositions);
  });

  it('shows only length on graph edges and vehicle metrics on highlighted route segments', async () => {
    installFetchMock();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    await screen.findByText('vehicle-1');
    const graphEdge = screen.getAllByTestId('graph-polyline')[0];
    const routeSegment = screen.getAllByTestId('route-polyline')[0];

    expect(graphEdge).toHaveTextContent('长度: 0.50 km');
    expect(graphEdge).not.toHaveTextContent('车辆燃油率');
    expect(routeSegment).toHaveTextContent('路段长度: 0.50 km');
    expect(routeSegment).toHaveTextContent('车辆燃油率: 0.20 L/km');
    expect(routeSegment).toHaveTextContent('预计路段燃油: 0.10 L');
    expect(routeSegment).toHaveTextContent('预计路段碳排放: 0.23 kg');
  });

  it('runs the homepage AI assistant flow against the current planned record', async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));
    expect(await screen.findByText('总距离: 3.50 km')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '打开 AI 助手' }));
    const input = screen.getByLabelText('向 AI 助手提问');
    await userEvent.type(input, '总结当前规划');
    await userEvent.click(screen.getByRole('button', { name: '发送问题' }));
    expect(await screen.findByText('第一段第二段')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('向 AI 助手提问'), '它为什么这样安排？');
    await userEvent.click(screen.getByRole('button', { name: '发送问题' }));
    expect(await screen.findByText('第二轮回答')).toBeInTheDocument();

    const aiCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/ai-assistant/chat/stream'),
    );
    const secondPayload = JSON.parse(String(aiCalls[1][1]?.body));
    expect(secondPayload).toMatchObject({ record_id: 1 });
    expect(secondPayload.messages).toEqual([
      { role: 'user', content: '总结当前规划' },
      { role: 'assistant', content: '第一段第二段' },
      { role: 'user', content: '它为什么这样安排？' },
    ]);

    await userEvent.click(screen.getByRole('button', { name: '推进时间' }));

    await waitFor(() => expect(screen.queryByText('第一段第二段')).not.toBeInTheDocument());
    expect(screen.getByText('请先执行或恢复路线规划，再向 AI 助手提问。')).toBeInTheDocument();
  });

  it('enters placement mode and creates custom nodes at the clicked map coordinate', async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await screen.findByText('绿运先锋');
    await userEvent.click(screen.getByRole('button', { name: '添加垃圾桶' }));

    expect(screen.getByText('点击地图放置垃圾桶')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/scenarios/current',
      expect.objectContaining({ method: 'PUT' }),
    );

    await userEvent.click(screen.getByTestId('leaflet-map'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/scenarios/current',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );

    const [, request] =
      fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('/api/scenarios/current') && init?.method === 'PUT',
      ) ?? [];
    const savedScenario = JSON.parse(String(request?.body));
    const createdBin = savedScenario.nodes.find((node: { id: string }) =>
      node.id.startsWith('bin-custom-'),
    );

    expect(createdBin).toMatchObject({ lat: 31.246, lng: 121.486, type: 'bin' });
    expect(screen.queryByText('点击地图放置垃圾桶')).not.toBeInTheDocument();
  });
});
