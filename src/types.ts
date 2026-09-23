// 装配工位台领域类型定义（只在浏览器本地使用，不涉及服务端）

export type ShellStatus = "空壳" | "已装药" | "已返工";

/** 工位 */
export interface Workstation {
  id: string;
  name: string;
  zone: "A区" | "B区";
  note: string;
}

/** 弹壳：记录口径、壳高与剩余可灌药量 */
export interface Shell {
  id: string;
  caliber: number; // 口径 mm
  height: number; // 壳高 mm
  capacity: number; // 额定装药 g
  filled: number; // 已灌药 g
  status: ShellStatus;
  stationId: string | null; // 当前所在工位
  fuseId: string | null; // 已装配引信
  assembledAt: string | null; // 最近一次装配时间
}

/** 引信：四种规格，长度决定能否满足壳高一半 */
export interface Fuse {
  id: string;
  name: string;
  length: number; // 引信长度 mm
  stock: number; // 库存数量（根）
}

export type RecordKind = "assembly" | "rework";
export type RecordResult = "passed" | "rejected";

/** 历史装配/返工/退回批次记录，历史装配保留、只追加不修改 */
export interface AssemblyRecord {
  id: string;
  kind: RecordKind;
  result: RecordResult;
  time: string; // ISO 时间
  stationId: string;
  stationName: string;
  shellIds: string[];
  shellCount: number;
  chargeGrams: number | null; // 本次灌药/返工后药重，非法输入时为 null
  fuseId: string | null;
  fuseName: string | null;
  grounded: boolean;
  reasons: string[]; // 整批退回原因
  parentId?: string; // 返工对应的原装配记录
  previousCharge?: number; // 返工前药重
}

export interface StoreState {
  workstations: Workstation[];
  shells: Shell[];
  fuses: Fuse[];
  records: AssemblyRecord[];
}

/** 装配表单 */
export interface AssemblyForm {
  stationId: string;
  shellIds: string[];
  chargeText: string;
  fuseId: string;
  grounded: boolean;
}

/** 返工表单：只能减药并重新确认接地 */
export interface ReworkForm {
  recordId: string;
  chargeText: string;
  grounded: boolean;
}

export interface Assessment {
  ok: boolean;
  reasons: string[];
  charge: number | null;
}
