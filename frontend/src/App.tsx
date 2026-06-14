import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import {
  advanceSimulationTime,
  generateRandomScenario,
  listPlanningRecords,
  loadPlanningRecord,
  loadCurrentScenario,
  planRoutes,
  renamePlanningRecord,
  restorePlanningRecord,
  saveScenario,
} from './api';
import type {
  Edge,
  PlanningRecordSummary,
  PlanningResult,
  ProcessingFacility,
  RouteStop,
  Scenario,
  ScenarioNode,
  Vehicle,
  VehicleRoute,
} from './types';
import './styles.css';

const CARBON_KG_PER_LITER = 2.31;

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
type CustomNodeType = 'bin' | 'vehicle' | 'facility';

const CUSTOM_NODE_LABELS: Record<CustomNodeType, string> = {
  bin: '垃圾桶',
  vehicle: '车辆',
  facility: '处理厂',
};

interface RenderedRouteSegment {
  route: VehicleRoute;
  index: number;
  sourceId: string;
  targetId: string;
  positions: LatLng[];
  distanceKm: number;
  fuelPerKm?: number;
}

interface SelectedRouteTaskContext {
  collectionOrderByNodeId: Map<string, number>;
  startNodeId: string | null;
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

function selectedVehicle(scenario: Scenario, route: VehicleRoute | null): Vehicle | undefined {
  if (!route) {
    return undefined;
  }
  return scenario.vehicles.find((vehicle) => vehicle.id === route.vehicle_id);
}

function selectedVehicleStartNode(
  scenario: Scenario,
  route: VehicleRoute | null,
): ScenarioNode | undefined {
  const vehicle = selectedVehicle(scenario, route);
  return vehicle ? findNode(scenario, vehicle.node_id) : undefined;
}

function orderedRouteStops(route: VehicleRoute): RouteStop[] {
  return [...route.stops].sort((left, right) => left.order - right.order);
}

function selectedRouteTaskContext(
  scenario: Scenario | null,
  selectedRoute: VehicleRoute | null,
): SelectedRouteTaskContext {
  if (!scenario || !selectedRoute) {
    return { collectionOrderByNodeId: new Map(), startNodeId: null };
  }

  const collectionOrderByNodeId = new Map<string, number>();
  for (const stop of orderedRouteStops(selectedRoute)) {
    if (stop.node_type === 'bin' && !collectionOrderByNodeId.has(stop.node_id)) {
      collectionOrderByNodeId.set(stop.node_id, collectionOrderByNodeId.size + 1);
    }
  }

  return {
    collectionOrderByNodeId,
    startNodeId: selectedVehicleStartNode(scenario, selectedRoute)?.id ?? null,
  };
}

function edgePositions(scenario: Scenario, edge: Edge): [number, number][] {
  const source = findNode(scenario, edge.source);
  const target = findNode(scenario, edge.target);
  return source && target ? [nodeLatLng(source), nodeLatLng(target)] : [];
}

function matchingEdge(scenario: Scenario, sourceId: string, targetId: string): Edge | undefined {
  return scenario.edges.find(
    (edge) =>
      (edge.source === sourceId && edge.target === targetId) ||
      (edge.source === targetId && edge.target === sourceId),
  );
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

function approximateDistanceKm(source: ScenarioNode, target: ScenarioNode): number {
  const latDistanceKm = (target.lat - source.lat) * 111.32;
  const lngDistanceKm =
    (target.lng - source.lng) * 111.32 * Math.cos(((source.lat + target.lat) / 2) * (Math.PI / 180));

  return Math.hypot(latDistanceKm, lngDistanceKm);
}

function routeSegmentGroups(routes: VehicleRoute[]) {
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

  return segmentGroups;
}

function renderedRouteSegments(
  scenario: Scenario,
  routes: VehicleRoute[],
  selectedRoute: VehicleRoute | null,
): RenderedRouteSegment[] {
  if (!selectedRoute) {
    return [];
  }

  const vehicle = scenario.vehicles.find((candidate) => candidate.id === selectedRoute.vehicle_id);
  const segmentGroups = routeSegmentGroups(routes);

  return selectedRoute.path_node_ids.flatMap((sourceId, index) => {
    const targetId = selectedRoute.path_node_ids[index + 1];
    if (!targetId) {
      return [];
    }

    const source = findNode(scenario, sourceId);
    const target = findNode(scenario, targetId);
    if (!source || !target) {
      return [];
    }

    const group = segmentGroups.get(routeSegmentKey(source.id, target.id)) ?? [];
    const segmentIndex = Math.max(
      group.findIndex(
        (segment) =>
          segment.routeId === selectedRoute.vehicle_id &&
          segment.sourceId === source.id &&
          segment.targetId === target.id,
      ),
      0,
    );
    const graphEdge = matchingEdge(scenario, sourceId, targetId);

    return {
      route: selectedRoute,
      index,
      sourceId,
      targetId,
      positions: curvedSegmentPositions(source, target, routeOffset(segmentIndex, group.length)),
      distanceKm: graphEdge?.weight ?? approximateDistanceKm(source, target),
      fuelPerKm: vehicle?.fuel_per_km,
    };
  });
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (latlng: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng);
    },
  });

  return null;
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

function markerStyle(
  node: ScenarioNode,
  selectedRoute: VehicleRoute | null,
  taskContext: SelectedRouteTaskContext,
) {
  const routeColor = selectedRoute?.color;
  const isSelectedStart = Boolean(routeColor && node.id === taskContext.startNodeId);
  const collectionOrder = taskContext.collectionOrderByNodeId.get(node.id);
  const isSelectedCollection = Boolean(routeColor && collectionOrder);

  return {
    className: isSelectedStart
      ? 'selected-route-start-marker'
      : isSelectedCollection
        ? 'selected-route-task-marker'
        : undefined,
    color: isSelectedStart || isSelectedCollection ? routeColor : '#0f172a',
    fillColor: markerColor(node),
    fillOpacity: 0.92,
    radius: isSelectedStart ? 12 : isSelectedCollection ? 11 : node.type === 'bin' ? 7 : 9,
    weight: isSelectedStart || isSelectedCollection ? 4 : 1,
    collectionOrder,
  };
}

function routeFacilityStop(route: VehicleRoute): RouteStop | undefined {
  return orderedRouteStops(route).find((stop) => stop.node_type === 'facility');
}

function currentLocation() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

function recordIdFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get('record_id');
  if (!value) {
    return null;
  }
  const recordId = Number(value);
  return Number.isFinite(recordId) ? recordId : null;
}

export default function App() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [plan, setPlan] = useState<PlanningResult | null>(null);
  const [currentPlanningTitle, setCurrentPlanningTitle] = useState<string | null>(null);
  const [seed, setSeed] = useState(202612);
  const [threshold, setThreshold] = useState(70);
  const [edgeSource, setEdgeSource] = useState('');
  const [edgeTarget, setEdgeTarget] = useState('');
  const [edgeWeight, setEdgeWeight] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [pendingNodeType, setPendingNodeType] = useState<CustomNodeType | null>(null);
  const [planningRecords, setPlanningRecords] = useState<PlanningRecordSummary[]>([]);
  const [location, setLocation] = useState(currentLocation);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    const handlePopState = () => setLocation(currentLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (location.pathname === '/history') {
      refreshPlanningRecords();
      return;
    }

    const recordId = recordIdFromSearch(location.search);
    if (recordId !== null) {
      runAction(async () => {
        await restorePlanningHistory(recordId);
      });
      return;
    }

    loadCurrentScenario()
      .then((loadedScenario) => {
        setScenario(loadedScenario);
        setPlan(null);
        setCurrentPlanningTitle(null);
      })
      .catch(() => {
        // 初始场景加载失败时允许用户通过随机生成继续演示。
      });
  }, [location.pathname, location.search]);

  useEffect(() => {
    setSelectedRouteId(plan?.routes[0]?.vehicle_id ?? null);
  }, [plan]);

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
  const selectedRoute =
    plan?.routes.find((route) => route.vehicle_id === selectedRouteId) ?? plan?.routes[0] ?? null;
  const selectedTaskContext = selectedRouteTaskContext(scenario, selectedRoute);
  const routeSegmentsToRender =
    scenario && plan ? renderedRouteSegments(scenario, plan.routes, selectedRoute) : [];

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

  async function refreshPlanningRecords() {
    try {
      setPlanningRecords(await listPlanningRecords());
    } catch {
      // 历史记录加载失败不阻塞当前地图演示。
    }
  }

  async function restorePlanningHistory(recordId: number) {
    const restored = await restorePlanningRecord(recordId);
    setScenario(restored.scenario);
    setPlan(restored.plan);
    setCurrentPlanningTitle(restored.record.title);
    setPendingNodeType(null);
    setError(null);
  }

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setLocation(currentLocation());
  }

  async function syncPlanningTitle(recordId: number | null | undefined) {
    if (!recordId) {
      setCurrentPlanningTitle(null);
      return;
    }
    const detail = await loadPlanningRecord(recordId);
    setCurrentPlanningTitle(detail.summary.title);
  }

  async function renameHistoryRecord(recordId: number, title: string) {
    const renamed = await renamePlanningRecord(recordId, title);
    setPlanningRecords((records) =>
      records.map((record) => (record.id === renamed.id ? renamed : record)),
    );
    if (plan?.record_id === renamed.id) {
      setCurrentPlanningTitle(renamed.title);
    }
    setEditingRecordId(null);
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

  async function persistScenario(next: Scenario) {
    const saved = await saveScenario(next);
    setScenario(saved);
    setPlan(null);
    setCurrentPlanningTitle(null);
    setSelectedRouteId(null);
  }

  async function addCustomNode(type: CustomNodeType, coordinate: { lat: number; lng: number }) {
    const current = baseScenario();
    const roundedCoordinate = {
      lat: Number(coordinate.lat.toFixed(6)),
      lng: Number(coordinate.lng.toFixed(6)),
    };
    const nodes = [...current.nodes];
    const vehiclesToSave: Vehicle[] = [...current.vehicles];
    const facilitiesToSave: ProcessingFacility[] = [...current.facilities];

    if (type === 'bin') {
      nodes.push({
        id: `bin-custom-${current.nodes.filter((node) => node.type === 'bin').length + 1}`,
        type: 'bin',
        ...roundedCoordinate,
        waste_type: 'kitchen',
        fill_rate: 60,
        capacity: 10,
        fill_trend: { kind: 'linear', rate_per_step: 2 },
      });
    } else if (type === 'vehicle') {
      const vehicleIndex = vehiclesToSave.length + 1;
      const nodeId = `vehicle-node-custom-${vehicleIndex}`;
      nodes.push({ id: nodeId, type: 'vehicle', ...roundedCoordinate });
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
      nodes.push({ id: nodeId, type: 'facility', ...roundedCoordinate });
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

  function handleMapClick(latlng: { lat: number; lng: number }) {
    if (!pendingNodeType) {
      return;
    }

    const nodeType = pendingNodeType;
    runAction(async () => {
      await addCustomNode(nodeType, latlng);
      setPendingNodeType(null);
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

  if (location.pathname === '/history') {
    return (
      <main className="app-shell history-shell">
        <section className="hero-panel history-hero">
          <div>
            <p className="eyebrow">Planning Archive</p>
            <h1>规划历史</h1>
            <p className="subtitle">查看、重命名并恢复已有的垃圾分类收运规划结果。</p>
          </div>
          <button type="button" onClick={() => navigate('/')}>
            返回首页
          </button>
        </section>

        <section className="history-page-panel">
          {error && <p className="error-box">{error}</p>}
          {planningRecords.length > 0 ? (
            <div className="history-page-list">
              {planningRecords.map((record) => (
                <div
                  key={record.id}
                  role="button"
                  tabIndex={0}
                  className="history-record-card history-record-card-large"
                  aria-label={`查看规划记录 ${record.id}`}
                  onClick={() => navigate(`/?record_id=${record.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/?record_id=${record.id}`);
                    }
                  }}
                >
                  {editingRecordId === record.id ? (
                    <form
                      className="history-rename-form"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        runAction(() => renameHistoryRecord(record.id, editingTitle));
                      }}
                    >
                      <label>
                        规划结果名称
                        <input
                          aria-label="规划结果名称"
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                        />
                      </label>
                      <button type="submit" disabled={loading} aria-label={`保存规划记录 ${record.id}`}>
                        保存
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="history-record-title">{record.title}</span>
                      <span>场景 {record.scenario_name}</span>
                      <span>模拟时间 {record.simulation_time}</span>
                      <span>路线 {record.route_count}</span>
                      <span>
                        {record.total_distance.toFixed(2)} km / {record.estimated_fuel.toFixed(2)} L /{' '}
                        {record.estimated_carbon.toFixed(2)} kg
                      </span>
                      <small>{record.created_at}</small>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={loading}
                        aria-label={`重命名规划记录 ${record.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingRecordId(record.id);
                          setEditingTitle(record.title);
                        }}
                      >
                        重命名
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">暂无规划记录</p>
          )}
        </section>
      </main>
    );
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
          <div className="panel-scroll">
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
                setCurrentPlanningTitle(null);
                setSelectedRouteId(null);
                setPendingNodeType(null);
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
                setPlan(null);
                setCurrentPlanningTitle(null);
                setSelectedRouteId(null);
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
                const nextPlan = await planRoutes(seed, threshold);
                setPlan(nextPlan);
                await syncPlanningTitle(nextPlan.record_id);
                await refreshPlanningRecords();
              })
            }
          >
            规划路线
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate('/history')}>
            查看规划历史
          </button>

          <div className="editor-card">
            <strong>自定义图</strong>
            <button
              type="button"
              disabled={loading}
              onClick={() => setPendingNodeType('bin')}
            >
              添加垃圾桶
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setPendingNodeType('vehicle')}
            >
              添加车辆
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setPendingNodeType('facility')}
            >
              添加处理厂
            </button>
            {pendingNodeType && (
              <p className="placement-hint">点击地图放置{CUSTOM_NODE_LABELS[pendingNodeType]}</p>
            )}
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
          </div>
        </aside>

        <section className="map-card" aria-label="路线地图">
          <MapContainer center={center} zoom={13} className="leaflet-stage" scrollWheelZoom>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onMapClick={handleMapClick} />
            {scenario?.edges.map((edge) => (
              <Polyline
                key={`${edge.source}-${edge.target}`}
                positions={edgePositions(scenario, edge)}
                pathOptions={{ className: 'graph-edge', color: '#334155', weight: 3, opacity: 0.85 }}
              >
                <Popup>长度: {edge.weight.toFixed(2)} km</Popup>
              </Polyline>
            ))}
            {scenario?.nodes.map((node) => {
              const style = markerStyle(node, selectedRoute, selectedTaskContext);

              return (
                <CircleMarker
                  key={node.id}
                  center={nodeLatLng(node)}
                  radius={style.radius}
                  pathOptions={{
                    className: style.className,
                    color: style.color,
                    fillColor: style.fillColor,
                    fillOpacity: style.fillOpacity,
                    weight: style.weight,
                  }}
                >
                  <Popup>
                    <strong>{node.id}</strong>
                    <br />
                    {node.type}
                    {node.waste_type ? ` / ${CATEGORY_LABELS[node.waste_type]}` : ''}
                    {typeof node.fill_rate === 'number' ? ` / ${node.fill_rate.toFixed(0)}%` : ''}
                    {node.id === selectedTaskContext.startNodeId && (
                      <>
                        <br />
                        车辆起点
                      </>
                    )}
                    {style.collectionOrder && (
                      <>
                        <br />
                        回收顺序: {style.collectionOrder}
                      </>
                    )}
                  </Popup>
                </CircleMarker>
              );
            })}
            {routeSegmentsToRender.map((segment) => {
              const segmentFuel =
                typeof segment.fuelPerKm === 'number'
                  ? segment.distanceKm * segment.fuelPerKm
                  : null;

              return (
                <Polyline
                  key={`${segment.route.vehicle_id}-${segment.index}-${segment.sourceId}-${segment.targetId}`}
                  positions={segment.positions}
                  pathOptions={{
                    className: 'selected-route-segment selected-route-flow',
                    color: segment.route.color,
                    dashArray: '10 8',
                    weight: 5,
                    opacity: 0.9,
                  }}
                >
                  <Popup>
                    <strong>路段长度: {segment.distanceKm.toFixed(2)} km</strong>
                    {segmentFuel !== null && typeof segment.fuelPerKm === 'number' && (
                      <>
                        <br />
                        车辆燃油率: {segment.fuelPerKm.toFixed(2)} L/km
                        <br />
                        预计路段燃油: {segmentFuel.toFixed(2)} L
                        <br />
                        预计路段碳排放:{' '}
                        {(segmentFuel * CARBON_KG_PER_LITER).toFixed(2)} kg
                      </>
                    )}
                  </Popup>
                </Polyline>
              );
            })}
          </MapContainer>
        </section>

        <aside className="insight-panel">
          <h2>规划结果</h2>
          {currentPlanningTitle && <p className="planning-title">{currentPlanningTitle}</p>}
          {plan ? (
            <>
              <div className="score-card">
                <span>总距离: {plan.total_distance.toFixed(2)} km</span>
                <span>油耗: {plan.estimated_fuel.toFixed(2)} L</span>
                <span>碳排放: {plan.estimated_carbon.toFixed(2)} kg</span>
              </div>
              <div className="route-scroll-window">
                <div className="route-list">
                  {plan.routes.map((route) => {
                  const routeStartNode =
                    scenario && selectedVehicleStartNode(scenario, route);
                  const collectionStops = orderedRouteStops(route).filter(
                    (stop) => stop.node_type === 'bin',
                  );
                  const facilityStop = routeFacilityStop(route);

                  return (
                    <button
                      key={route.vehicle_id}
                      type="button"
                      className={`route-card ${
                        selectedRoute?.vehicle_id === route.vehicle_id ? 'route-card-selected' : ''
                      }`}
                      aria-label={`选择路线 ${route.vehicle_id}`}
                      aria-pressed={selectedRoute?.vehicle_id === route.vehicle_id}
                      onClick={() => setSelectedRouteId(route.vehicle_id)}
                    >
                      <span className="route-swatch" style={{ background: route.color }} />
                      <span className="route-title">{route.vehicle_id}</span>
                      <span className="route-task-chain">
                        {routeStartNode && (
                          <span className="route-task route-task-start">
                            起点 {routeStartNode.id}
                          </span>
                        )}
                        {collectionStops.map((stop, index) => (
                          <span key={`${route.vehicle_id}-${stop.node_id}-${stop.order}`} className="route-task route-task-bin">
                            {index + 1} 回收 {stop.node_id}
                            {typeof stop.fill_rate === 'number'
                              ? ` · ${stop.fill_rate.toFixed(0)}%`
                              : ''}
                          </span>
                        ))}
                        {facilityStop && (
                          <span className="route-task route-task-facility">
                            终点 {facilityStop.node_id}
                          </span>
                        )}
                      </span>
                      <small>{route.distance.toFixed(2)} km</small>
                    </button>
                  );
                })}
                </div>
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
