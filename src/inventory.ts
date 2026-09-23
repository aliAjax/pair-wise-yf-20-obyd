// 库存业务：弹壳 / 引信台账、装配与返工规则、本地持久化
// 数据只保存在浏览器 localStorage，不上传、不依赖任何外部服务。

const STORAGE_KEY = "firework-shell-assembly-v1";

/** 弹壳：记录口径、壳高与剩余可灌药量 */
export interface Shell {
  id: string;
  name: string;
  caliber: number; // 口径 mm
  height: number; // 壳高 mm
  capacity: number; // 额定可灌药量 g
  remaining: number; // 剩余可灌药量 g
}

/** 引信种类 */
export interface Fuse {
  id: string;
  name: string;
  burnRate: string; // 燃速标注
  stock: number; // 库存长度 mm
}

export type RecordKind = "装配" | "返工";

/** 装配历史（只追加，返工时原始装配保留） */
export interface AssemblyRecord {
  seq: number;
  batch: string;
  kind: RecordKind;
  stationId: string;
  shellId: string;
  shellName: string;
  caliber: number;
  height: number;
  fuseId: string;
  fuseName: string;
  fuseLength: number; // 返工沿用原引信长度
  powder: number; // 装配=灌药克数；返工=减药克数
  fillAfter: number; // 本次操作后弹体内总药量 g
  grounded: boolean;
  reworkBatch?: string; // 返工所针对的原装配批次
  time: string;
}

export interface WorkshopState {
  shells: Shell[];
  fuses: Fuse[];
  records: AssemblyRecord[];
}

/** 预置八只弹壳 */
const SEED_SHELLS: Shell[] = [
  { id: "KC-01", name: "一号弹壳", caliber: 25, height: 60, capacity: 40, remaining: 40 },
  { id: "KC-02", name: "二号弹壳", caliber: 30, height: 72, capacity: 55, remaining: 55 },
  { id: "KC-03", name: "三号弹壳", caliber: 38, height: 90, capacity: 80, remaining: 80 },
  { id: "KC-04", name: "四号弹壳", caliber: 50, height: 115, capacity: 130, remaining: 130 },
  { id: "KC-05", name: "五号弹壳", caliber: 63, height: 140, capacity: 200, remaining: 200 },
  { id: "KC-06", name: "六号弹壳", caliber: 76, height: 170, capacity: 290, remaining: 290 },
  { id: "KC-07", name: "七号弹壳", caliber: 102, height: 220, capacity: 480, remaining: 480 },
  { id: "KC-08", name: "八号弹壳", caliber: 127, height: 270, capacity: 720, remaining: 720 },
];

/** 预置四种引信 */
const SEED_FUSES: Fuse[] = [
  { id: "YX-A", name: "速燃快引", burnRate: "燃速约 30 mm/s", stock: 8000 },
  { id: "YX-B", name: "安全延时引信", burnRate: "燃速约 4 mm/s", stock: 8000 },
  { id: "YX-C", name: "棉线缓冲引", burnRate: "燃速约 8 mm/s", stock: 6000 },
  { id: "YX-D", name: "防水并联引", burnRate: "燃速约 12 mm/s", stock: 6000 },
];

export function seedWorkshop(): WorkshopState {
  return {
    shells: SEED_SHELLS.map((s) => ({ ...s })),
    fuses: SEED_FUSES.map((f) => ({ ...f })),
    records: [],
  };
}

/** 读取本地台账；无记录或数据损坏时回落到预置数据 */
export function loadWorkshop(): WorkshopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedWorkshop();
    const data = JSON.parse(raw) as WorkshopState;
    if (!Array.isArray(data.shells) || !Array.isArray(data.fuses) || !Array.isArray(data.records)) {
      return seedWorkshop();
    }
    return data;
  } catch {
    return seedWorkshop();
  }
}

export function saveWorkshop(state: WorkshopState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等场景下静默失败，不影响当前工位作业
  }
}

export function resetWorkshop(): WorkshopState {
  const seed = seedWorkshop();
  saveWorkshop(seed);
  return seed;
}

/** 工位在制情况（由装配与返工记录推算） */
export interface Occupancy {
  stationId: string;
  shell: Shell;
  fuse: Fuse;
  fill: number; // 当前弹体内已灌药量
  fuseLength: number;
  grounded: boolean;
  assembly: AssemblyRecord; // 原始装配记录
  latest: AssemblyRecord; // 最近一次作业（装配或返工）
}

export function occupancyMap(state: WorkshopState): Map<string, Occupancy> {
  const map = new Map<string, Occupancy>();
  for (const record of state.records) {
    if (record.kind === "装配") {
      const shell = state.shells.find((s) => s.id === record.shellId);
      const fuse = state.fuses.find((f) => f.id === record.fuseId);
      if (!shell || !fuse) continue;
      map.set(record.stationId, {
        stationId: record.stationId,
        shell,
        fuse,
        fill: record.fillAfter,
        fuseLength: record.fuseLength,
        grounded: record.grounded,
        assembly: record,
        latest: record,
      });
    } else {
      const occ = map.get(record.stationId);
      if (occ) {
        occ.fill = record.fillAfter;
        occ.grounded = record.grounded;
        occ.latest = record;
      }
    }
  }
  return map;
}

export interface OperationResult {
  ok: boolean;
  errors: string[];
  state: WorkshopState; // 校验不通过时与入参完全相同（整批退回，原工位和物料不动）
  record?: AssemblyRecord;
}

export interface AssembleInput {
  stationId: string;
  shellId: string;
  powder: number;
  fuseId: string;
  fuseLength: number;
  grounded: boolean;
}

function batchNo(prefix: string, now: Date, seq: number): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${prefix}${y}${m}${d}-${String(seq).padStart(3, "0")}`;
}

function timeText(now: Date): string {
  return now.toLocaleString("zh-CN", { hour12: false });
}

/**
 * 整批装配。任一规则不通过即整批退回，不修改任何数据：
 * 1. 静电接地必须确认；
 * 2. 灌药克数不得超过该弹壳剩余可灌药量；
 * 3. 引信长度不得短于壳高的一半。
 */
export function assemble(prev: WorkshopState, input: AssembleInput, now = new Date()): OperationResult {
  const shell = prev.shells.find((s) => s.id === input.shellId);
  const fuse = prev.fuses.find((f) => f.id === input.fuseId);
  const errors: string[] = [];

  if (!input.grounded) {
    errors.push("静电接地未确认：作业前必须勾选并完成静电接地确认");
  }
  if (!shell || !fuse) {
    errors.push("工位、弹壳或引信选择无效，请重新选择");
  }

  if (shell && fuse) {
    if (!Number.isFinite(input.powder) || input.powder <= 0) {
      errors.push("灌药克数无效：请填写大于 0 的数字");
    } else if (input.powder > shell.remaining) {
      errors.push(
        `灌药 ${input.powder} g 超过该弹壳剩余可灌药量 ${shell.remaining} g（额定 ${shell.capacity} g）`
      );
    }

    const minFuseLength = shell.height / 2;
    if (!Number.isFinite(input.fuseLength) || input.fuseLength <= 0) {
      errors.push("引信长度无效：请填写大于 0 的数字");
    } else if (input.fuseLength < minFuseLength) {
      errors.push(
        `引信长度 ${input.fuseLength} mm 不足壳高 ${shell.height} mm 的一半（至少 ${minFuseLength} mm）`
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, state: prev };
  }

  const state: WorkshopState = {
    shells: prev.shells.map((s) =>
      s.id === shell!.id ? { ...s, remaining: +(s.remaining - input.powder).toFixed(3) } : s
    ),
    fuses: prev.fuses.map((f) =>
      f.id === fuse!.id ? { ...f, stock: Math.max(0, f.stock - input.fuseLength) } : f
    ),
    records: [...prev.records],
  };

  const record: AssemblyRecord = {
    seq: prev.records.length + 1,
    batch: batchNo("ZP", now, prev.records.length + 1),
    kind: "装配",
    stationId: input.stationId,
    shellId: shell!.id,
    shellName: shell!.name,
    caliber: shell!.caliber,
    height: shell!.height,
    fuseId: fuse!.id,
    fuseName: fuse!.name,
    fuseLength: input.fuseLength,
    powder: input.powder,
    fillAfter: input.powder,
    grounded: true,
    time: timeText(now),
  };
  state.records.push(record);

  return { ok: true, errors: [], state, record };
}

export interface ReworkInput {
  stationId: string;
  remove: number; // 本次减药克数
  grounded: boolean; // 返工必须重新确认接地
}

/**
 * 工位返工：只能减药（减药克数为正且不超过当前已灌药量），
 * 必须重新确认静电接地；原装配记录保留，另记一条返工记录。
 */
export function rework(prev: WorkshopState, input: ReworkInput, now = new Date()): OperationResult {
  const occ = occupancyMap(prev).get(input.stationId);
  const errors: string[] = [];

  if (!occ) {
    errors.push("该工位没有在制弹体，无法返工");
  }
  if (!input.grounded) {
    errors.push("静电接地未重新确认：返工前必须再次完成接地确认");
  }
  if (occ) {
    if (!Number.isFinite(input.remove) || input.remove <= 0) {
      errors.push("返工只能减药：请填写大于 0 的减药克数");
    } else if (input.remove > occ.fill) {
      errors.push(`减药 ${input.remove} g 超过当前弹体内已灌药量 ${occ.fill} g，返工不允许加药`);
    }
  }

  if (errors.length > 0 || !occ) {
    return { ok: false, errors, state: prev };
  }

  const fillAfter = +(occ.fill - input.remove).toFixed(3);
  const state: WorkshopState = {
    shells: prev.shells.map((s) =>
      s.id === occ.shell.id ? { ...s, remaining: +(s.remaining + input.remove).toFixed(3) } : s
    ),
    fuses: prev.fuses.map((f) => ({ ...f })),
    records: [...prev.records],
  };

  const record: AssemblyRecord = {
    seq: prev.records.length + 1,
    batch: batchNo("FG", now, prev.records.length + 1),
    kind: "返工",
    stationId: input.stationId,
    shellId: occ.shell.id,
    shellName: occ.shell.name,
    caliber: occ.shell.caliber,
    height: occ.shell.height,
    fuseId: occ.fuse.id,
    fuseName: occ.fuse.name,
    fuseLength: occ.fuseLength,
    powder: input.remove,
    fillAfter,
    grounded: true,
    reworkBatch: occ.assembly.batch,
    time: timeText(now),
  };
  state.records.push(record);

  return { ok: true, errors: [], state, record };
}
