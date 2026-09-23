import type { Fuse, Shell, StoreState, Workstation } from "./types";

// 预置四条工位
export const workstations: Workstation[] = [
  { id: "ST-A1", name: "A1 灌药位", zone: "A区", note: "静电防护区" },
  { id: "ST-A2", name: "A2 封口位", zone: "A区", note: "靠近接地母线" },
  { id: "ST-B1", name: "B1 插引位", zone: "B区", note: "防潮台面" },
  { id: "ST-B2", name: "B2 检验位", zone: "B区", note: "成品暂存前" },
];

// 预置八只弹壳：口径、壳高、额定装药（初始剩余可灌药量 = 额定装药）
export const shells: Shell[] = [
  { id: "SH-01", caliber: 30, height: 120, capacity: 60, filled: 0, status: "空壳", stationId: null, fuseId: null, assembledAt: null },
  { id: "SH-02", caliber: 30, height: 120, capacity: 60, filled: 0, status: "空壳", stationId: null, fuseId: null, assembledAt: null },
  { id: "SH-03", caliber: 45, height: 160, capacity: 110, filled: 0, status: "空壳", stationId: null, fuseId: null, assembledAt: null },
  { id: "SH-04", caliber: 45, height: 160, capacity: 110, filled: 0, status: "空壳", stationId: null, fuseId: null, assembledAt: null },
  { id: "SH-05", caliber: 60, height: 190, capacity: 180, filled: 0, status: "空壳", stationId: null, fuseId: null, assembledAt: null },
  { id: "SH-06", caliber: 60, height: 190, capacity: 180, filled: 0, status: "空壳", stationId: null, fuseId: null, assembledAt: null },
  { id: "SH-07", caliber: 75, height: 220, capacity: 260, filled: 0, status: "空壳", stationId: null, fuseId: null, assembledAt: null },
  { id: "SH-08", caliber: 90, height: 260, capacity: 360, filled: 0, status: "空壳", stationId: null, fuseId: null, assembledAt: null },
];

// 预置四种引信（含库存根数）
export const fuses: Fuse[] = [
  { id: "F-01", name: "短导火索", length: 60, stock: 20 },
  { id: "F-02", name: "标准导火索", length: 100, stock: 16 },
  { id: "F-03", name: "加长导火索", length: 150, stock: 12 },
  { id: "F-04", name: "延时引信", length: 220, stock: 8 },
];

export function createInitialState(): StoreState {
  return {
    workstations: workstations.map((w) => ({ ...w })),
    shells: shells.map((s) => ({ ...s })),
    fuses: fuses.map((f) => ({ ...f })),
    records: [],
  };
}
