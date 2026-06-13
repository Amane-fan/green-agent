import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    pathOptions?: { className?: string; color?: string; opacity?: number; weight?: number };
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

function installFetchMock(planningResponse = planPayload) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
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
