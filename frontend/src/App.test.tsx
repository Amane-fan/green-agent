import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import App from './App';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="leaflet-map">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Polyline: ({
    children,
    positions,
    pathOptions,
  }: {
    children?: ReactNode;
    positions: [number, number][];
    pathOptions?: { color?: string; weight?: number };
  }) => (
    <div
      data-testid={children ? 'graph-polyline' : 'route-polyline'}
      data-color={pathOptions?.color}
      data-positions={JSON.stringify(positions)}
    >
      {children}
    </div>
  ),
  CircleMarker: ({ children }: { children?: ReactNode }) => (
    <div data-testid="circle-marker">{children}</div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
    { id: 'vehicle-node-1', type: 'vehicle', lat: 31.22, lng: 121.46 },
    { id: 'facility-node-1', type: 'facility', lat: 31.21, lng: 121.45 },
  ],
  edges: [{ source: 'vehicle-node-1', target: 'bin-1', weight: 1.2 }],
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
      path_node_ids: ['vehicle-node-1', 'bin-1', 'facility-node-1'],
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
  it('renders scenario layers and random generation controls', async () => {
    installFetchMock();

    render(<App />);

    await screen.findByText('绿运先锋');
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));

    expect(await screen.findByText('垃圾桶: 1')).toBeInTheDocument();
    expect(screen.getByText('车辆: 1')).toBeInTheDocument();
    expect(screen.getByText('处理厂: 1')).toBeInTheDocument();
    expect(screen.getByText('图状态: 可规划')).toBeInTheDocument();
    expect(screen.queryByTestId('tile-layer')).not.toBeInTheDocument();
  });

  it('advances time and displays planned route metrics', async () => {
    installFetchMock();

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(await screen.findByRole('button', { name: '推进时间' }));
    await waitFor(() => expect(screen.getByText('模拟时间: 1')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    expect(await screen.findByText('总距离: 3.50 km')).toBeInTheDocument();
    expect(screen.getByText('vehicle-1')).toBeInTheDocument();
    expect(screen.getByText('bin-1 -> facility-node-1')).toBeInTheDocument();
  });

  it('curves overlapping vehicle routes so each route remains visible', async () => {
    installFetchMock(overlappingPlanPayload);

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '随机生成场景' }));
    await userEvent.click(screen.getByRole('button', { name: '规划路线' }));

    await screen.findByText('vehicle-2');
    const routeLines = screen.getAllByTestId('route-polyline');

    expect(routeLines).toHaveLength(2);
    expect(routeLines[0]).toHaveAttribute('data-color', '#16a34a');
    expect(routeLines[1]).toHaveAttribute('data-color', '#dc2626');
    expect(routeLines[0].getAttribute('data-positions')).not.toEqual(
      routeLines[1].getAttribute('data-positions'),
    );
  });

  it('adds custom nodes and saves them through the scenario API', async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await screen.findByText('绿运先锋');
    await userEvent.click(screen.getByRole('button', { name: '添加垃圾桶' }));

    expect(await screen.findByText('垃圾桶: 2')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/scenarios/current',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
