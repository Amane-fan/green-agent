import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import {
  advanceSimulationTime,
  generateRandomScenario,
  loadCurrentScenario,
  planRoutes,
  saveScenario,
} from './api';
import type {
  Edge,
  PlanningResult,
  ProcessingFacility,
  Scenario,
  ScenarioNode,
  Vehicle,
  VehicleRoute,
} from './types';
import './styles.css';

const CATEGORY_LABELS = {
  kitchen: '厨余',
  recyclable: '可回收',
  hazardous: '有害',
  other: '其他',
};

const CATEGORY_COLORS = {
  kitchen: '#22c55e',
  recyclable: '#38bdf8',
  hazardous: '#ef4444',
  other: '#f59e0b',
};

type LatLng = [number, number];

interface RenderedRoute {
  route: VehicleRoute;
  positions: LatLng[];
}

function nodeLatLng(node: ScenarioNode): [number, number] {
  return [node.lat, node.lng];
}

function findNode(scenario: Scenario, nodeId: string): ScenarioNode | undefined {
  return scenario.nodes.find((node) => node.id === nodeId);
}

function routeNodes(scenario: Scenario, route: VehicleRoute): ScenarioNode[] {
  return route.path_node_ids
    .map((nodeId) => findNode(scenario, nodeId))
    .filter((node): node is ScenarioNode => Boolean(node));
}

function edgePositions(scenario: Scenario, edge: Edge): [number, number][] {
  const source = findNode(scenario, edge.source);
  const target = findNode(scenario, edge.target);
  return source && target ? [nodeLatLng(source), nodeLatLng(target)] : [];
}

function routeSegmentKey(sourceId: string, targetId: string): string {
  return [sourceId, targetId].sort().join('::');
}

function routeOffset(index: number, total: number): number {
  if (total <= 1) {
    return 0;
  }
  return (index - (total - 1) / 2) * 0.0014;
}

function curvedSegmentPositions(source: ScenarioNode, target: ScenarioNode, offset: number): LatLng[] {
  const start = nodeLatLng(source);
  const end = nodeLatLng(target);

  if (offset === 0) {
    return [start, end];
  }

  const midLat = (source.lat + target.lat) / 2;
  const midLng = (source.lng + target.lng) / 2;
  const [canonicalSource, canonicalTarget] =
    source.id.localeCompare(target.id) <= 0 ? [source, target] : [target, source];
  const deltaLat = canonicalTarget.lat - canonicalSource.lat;
  const deltaLng = canonicalTarget.lng - canonicalSource.lng;
  const length = Math.hypot(deltaLat, deltaLng) || 1;
  const control: LatLng = [
    midLat + (-deltaLng / length) * offset,
    midLng + (deltaLat / length) * offset,
  ];

  return [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const inverse = 1 - step;
    return [
      inverse * inverse * start[0] + 2 * inverse * step * control[0] + step * step * end[0],
      inverse * inverse * start[1] + 2 * inverse * step * control[1] + step * step * end[1],
    ];
  });
}

function renderedRoutes(scenario: Scenario, routes: VehicleRoute[]): RenderedRoute[] {
  const segmentGroups = new Map<string, Array<{ routeId: string; sourceId: string; targetId: string }>>();

  for (const route of routes) {
    for (let index = 0; index < route.path_node_ids.length - 1; index += 1) {
      const sourceId = route.path_node_ids[index];
      const targetId = route.path_node_ids[index + 1];
      const key = routeSegmentKey(sourceId, targetId);
      segmentGroups.set(key, [
        ...(segmentGroups.get(key) ?? []),
        { routeId: route.vehicle_id, sourceId, targetId },
      ]);
    }
  }

  return routes.map((route) => {
    const nodes = routeNodes(scenario, route);
    const positions = nodes.flatMap((source, index) => {
      const target = nodes[index + 1];
      if (!target) {
        return index === 0 ? [nodeLatLng(source)] : [];
      }

      const group = segmentGroups.get(routeSegmentKey(source.id, target.id)) ?? [];
      const segmentIndex = Math.max(
        group.findIndex(
          (segment) =>
            segment.routeId === route.vehicle_id &&
            segment.sourceId === source.id &&
            segment.targetId === target.id,
        ),
        0,
      );
      const segmentPositions = curvedSegmentPositions(
        source,
        target,
        routeOffset(segmentIndex, group.length),
      );
      return index === 0 ? segmentPositions : segmentPositions.slice(1);
    });

    return { route, positions };
  });
}

function markerColor(node: ScenarioNode): string {
  if (node.type === 'vehicle') {
    return '#e5e7eb';
  }
  if (node.type === 'facility') {
    return '#a78bfa';
  }
  const base = node.waste_type ? CATEGORY_COLORS[node.waste_type] : '#94a3b8';
  if ((node.fill_rate ?? 0) >= 90) {
    return '#f97316';
  }
  if ((node.fill_rate ?? 0) >= 70) {
    return '#facc15';
  }
  return base;
}

export default function App() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [plan, setPlan] = useState<PlanningResult | null>(null);
  const [seed, setSeed] = useState(202612);
  const [threshold, setThreshold] = useState(70);
  const [edgeSource, setEdgeSource] = useState('');
  const [edgeTarget, setEdgeTarget] = useState('');
  const [edgeWeight, setEdgeWeight] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCurrentScenario()
      .then(setScenario)
      .catch(() => {
        // 初始场景加载失败时允许用户通过随机生成继续演示。
      });
  }, []);

  const center = useMemo<[number, number]>(() => {
    if (!scenario?.nodes.length) {
      return [31.23, 121.47];
    }
    const lat = scenario.nodes.reduce((sum, node) => sum + node.lat, 0) / scenario.nodes.length;
    const lng = scenario.nodes.reduce((sum, node) => sum + node.lng, 0) / scenario.nodes.length;
    return [lat, lng];
  }, [scenario]);

  const bins = scenario?.nodes.filter((node) => node.type === 'bin') ?? [];
  const vehicles = scenario?.vehicles ?? [];
  const facilities = scenario?.facilities ?? [];
  const routesToRender = scenario && plan ? renderedRoutes(scenario, plan.routes) : [];

  async function runAction(action: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  }

  function baseScenario(): Scenario {
    return (
      scenario ?? {
        id: `custom-${seed}`,
        name: '自定义场景',
        current_time: 0,
        nodes: [],
        edges: [],
        vehicles: [],
        facilities: [],
        validation: { is_valid: false, disconnected_nodes: [], warnings: ['Scenario has no nodes'] },
      }
    );
  }

  function nextCoordinate(offset: number): { lat: number; lng: number } {
    return {
      lat: Number((center[0] + offset * 0.002).toFixed(6)),
      lng: Number((center[1] + offset * 0.002).toFixed(6)),
    };
  }

  async function persistScenario(next: Scenario) {
    const saved = await saveScenario(next);
    setScenario(saved);
    setPlan(null);
  }

  async function addCustomNode(type: 'bin' | 'vehicle' | 'facility') {
    const current = baseScenario();
    const offset = current.nodes.length + 1;
    const coordinate = nextCoordinate(offset);
    const nodes = [...current.nodes];
    const vehiclesToSave: Vehicle[] = [...current.vehicles];
    const facilitiesToSave: ProcessingFacility[] = [...current.facilities];

    if (type === 'bin') {
      nodes.push({
        id: `bin-custom-${current.nodes.filter((node) => node.type === 'bin').length + 1}`,
        type: 'bin',
        ...coordinate,
        waste_type: 'kitchen',
        fill_rate: 60,
        capacity: 10,
        fill_trend: { kind: 'linear', rate_per_step: 2 },
      });
    } else if (type === 'vehicle') {
      const vehicleIndex = vehiclesToSave.length + 1;
      const nodeId = `vehicle-node-custom-${vehicleIndex}`;
      nodes.push({ id: nodeId, type: 'vehicle', ...coordinate });
      vehiclesToSave.push({
        id: `vehicle-custom-${vehicleIndex}`,
        node_id: nodeId,
        supported_waste_type: 'kitchen',
        capacity: 80,
        fuel_per_km: 0.2,
        color: '#22c55e',
      });
    } else {
      const facilityIndex = facilitiesToSave.length + 1;
      const nodeId = `facility-node-custom-${facilityIndex}`;
      nodes.push({ id: nodeId, type: 'facility', ...coordinate });
      facilitiesToSave.push({
        id: `facility-custom-${facilityIndex}`,
        node_id: nodeId,
        accepted_waste_types: ['kitchen', 'recyclable', 'hazardous', 'other'],
        capacity: 500,
      });
    }

    await persistScenario({
      ...current,
      nodes,
      vehicles: vehiclesToSave,
      facilities: facilitiesToSave,
    });
  }

  async function addCustomEdge() {
    const current = baseScenario();
    if (!edgeSource || !edgeTarget || edgeSource === edgeTarget || edgeWeight <= 0) {
      setError('请选择两个不同节点，并输入正数边权');
      return;
    }
    await persistScenario({
      ...current,
      edges: [
        ...current.edges,
        { source: edgeSource, target: edgeTarget, weight: Number(edgeWeight) },
      ],
    });
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">SE2026-12 多智能体调度实验台</p>
          <h1>绿运先锋</h1>
          <p className="subtitle">
            将垃圾桶、收运车辆和处理厂抽象为无向连通图，基于满溢率和路径距离规划分类收运路线。
          </p>
        </div>
        <div className="status-card">
          <span>模拟时间: {scenario?.current_time ?? 0}</span>
          <strong>{scenario?.validation.is_valid ? '图状态: 可规划' : '图状态: 待校验'}</strong>
        </div>
      </section>

      <section className="workspace">
        <aside className="control-panel">
          <label>
            随机种子
            <input
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value))}
              type="number"
            />
          </label>
          <label>
            收运阈值
            <input
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
              type="number"
              min={0}
              max={100}
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              runAction(async () => {
                const next = await generateRandomScenario(seed);
                setScenario(next);
                setPlan(null);
              })
            }
          >
            随机生成场景
          </button>
          <button
            type="button"
            disabled={loading || !scenario}
            onClick={() =>
              runAction(async () => {
                const next = await advanceSimulationTime(1);
                setScenario(next);
              })
            }
          >
            推进时间
          </button>
          <button
            type="button"
            disabled={loading || !scenario || !scenario.validation.is_valid}
            onClick={() =>
              runAction(async () => {
                setPlan(await planRoutes(seed, threshold));
              })
            }
          >
            规划路线
          </button>

          <div className="editor-card">
            <strong>自定义图</strong>
            <button
              type="button"
              disabled={loading}
              onClick={() => runAction(() => addCustomNode('bin'))}
            >
              添加垃圾桶
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => runAction(() => addCustomNode('vehicle'))}
            >
              添加车辆
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => runAction(() => addCustomNode('facility'))}
            >
              添加处理厂
            </button>
            <select
              aria-label="边起点"
              value={edgeSource}
              onChange={(event) => setEdgeSource(event.target.value)}
            >
              <option value="">边起点</option>
              {scenario?.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.id}
                </option>
              ))}
            </select>
            <select
              aria-label="边终点"
              value={edgeTarget}
              onChange={(event) => setEdgeTarget(event.target.value)}
            >
              <option value="">边终点</option>
              {scenario?.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.id}
                </option>
              ))}
            </select>
            <input
              aria-label="边权"
              value={edgeWeight}
              onChange={(event) => setEdgeWeight(Number(event.target.value))}
              type="number"
              min={0.1}
              step={0.1}
            />
            <button type="button" disabled={loading} onClick={() => runAction(addCustomEdge)}>
              添加边
            </button>
          </div>
          {error && <p className="error-box">{error}</p>}

          <div className="metric-grid">
            <span>垃圾桶: {bins.length}</span>
            <span>车辆: {vehicles.length}</span>
            <span>处理厂: {facilities.length}</span>
            <span>边: {scenario?.edges.length ?? 0}</span>
          </div>
        </aside>

        <section className="map-card" aria-label="路线地图">
          <MapContainer center={center} zoom={13} className="leaflet-stage" scrollWheelZoom>
            {scenario?.edges.map((edge) => (
              <Polyline
                key={`${edge.source}-${edge.target}`}
                positions={edgePositions(scenario, edge)}
                pathOptions={{ color: '#64748b', weight: 1.5, opacity: 0.5 }}
              >
                <Popup>{edge.weight.toFixed(2)} km</Popup>
              </Polyline>
            ))}
            {scenario?.nodes.map((node) => (
              <CircleMarker
                key={node.id}
                center={nodeLatLng(node)}
                radius={node.type === 'bin' ? 7 : 9}
                pathOptions={{
                  color: '#0f172a',
                  fillColor: markerColor(node),
                  fillOpacity: 0.92,
                  weight: 1,
                }}
              >
                <Popup>
                  <strong>{node.id}</strong>
                  <br />
                  {node.type}
                  {node.waste_type ? ` / ${CATEGORY_LABELS[node.waste_type]}` : ''}
                  {typeof node.fill_rate === 'number' ? ` / ${node.fill_rate.toFixed(0)}%` : ''}
                </Popup>
              </CircleMarker>
            ))}
            {routesToRender.map(({ route, positions }) => (
                <Polyline
                  key={route.vehicle_id}
                  positions={positions}
                  pathOptions={{ color: route.color, weight: 5, opacity: 0.9 }}
                />
              ))}
          </MapContainer>
        </section>

        <aside className="insight-panel">
          <h2>规划结果</h2>
          {plan ? (
            <>
              <div className="score-card">
                <span>总距离: {plan.total_distance.toFixed(2)} km</span>
                <span>油耗: {plan.estimated_fuel.toFixed(2)} L</span>
                <span>碳排放: {plan.estimated_carbon.toFixed(2)} kg</span>
              </div>
              <div className="route-list">
                {plan.routes.map((route) => (
                  <article key={route.vehicle_id} className="route-card">
                    <span className="route-swatch" style={{ background: route.color }} />
                    <h3>{route.vehicle_id}</h3>
                    <p>{route.stops.map((stop) => stop.node_id).join(' -> ')}</p>
                    <small>{route.distance.toFixed(2)} km</small>
                  </article>
                ))}
              </div>
              {plan.unassigned_tasks.length > 0 && (
                <div className="warning-box">
                  未分配: {plan.unassigned_tasks.map((task) => task.bin_id).join(', ')}
                </div>
              )}
            </>
          ) : (
            <p className="empty-state">生成场景并点击规划路线后，这里会显示多车辆路径和指标。</p>
          )}
        </aside>
      </section>
    </main>
  );
}
