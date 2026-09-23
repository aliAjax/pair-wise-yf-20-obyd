import { useEffect, useReducer } from "react";
import { createInitialState } from "./data";
import type {
  AssemblyForm,
  AssemblyRecord,
  Assessment,
  ReworkForm,
  StoreState,
} from "./types";

// 数据只存本地浏览器
const STORAGE_KEY = "fireworks-assembly-bench:v1";

function isValidState(value: unknown): value is StoreState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<StoreState>;
  return (
    Array.isArray(s.workstations) &&
    Array.isArray(s.shells) &&
    Array.isArray(s.fuses) &&
    Array.isArray(s.records)
  );
}

function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidState(parsed)) return parsed;
    }
  } catch {
    // 本地数据损坏时回退到预置数据
  }
  return createInitialState();
}

let seq = 0;
function makeId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function parseCharge(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// 装配校验：静电接地未确认 / 灌药超过余量 / 引信不足壳高一半（以及其他基本项）
// 任一不满足即整批退回，调用方据此保证工位与物料不动
export function assessAssembly(state: StoreState, form: AssemblyForm): Assessment {
  const reasons: string[] = [];
  const charge = parseCharge(form.chargeText);

  const station = state.workstations.find((w) => w.id === form.stationId);
  if (!station) reasons.push("未选择工位");

  if (form.shellIds.length === 0) {
    reasons.push("未选择弹壳，无法成批装配");
  }

  if (charge === null) {
    reasons.push("灌药克数不是有效数字");
  } else if (charge <= 0) {
    reasons.push("灌药克数必须大于 0");
  }

  const fuse = state.fuses.find((f) => f.id === form.fuseId);
  if (!fuse) {
    reasons.push("未选择引信");
  } else if (fuse.stock < form.shellIds.length) {
    reasons.push(`引信「${fuse.name}」库存不足（剩 ${fuse.stock} 根，本批需 ${form.shellIds.length} 根）`);
  }

  if (!form.grounded) {
    reasons.push("静电接地未确认");
  }

  for (const id of form.shellIds) {
    const shell = state.shells.find((s) => s.id === id);
    if (!shell) {
      reasons.push(`弹壳 ${id} 不存在`);
      continue;
    }
    if (shell.status !== "空壳") {
      reasons.push(`${shell.id} 已装配（${shell.status}），调整药重请走返工`);
    }
    const remaining = shell.capacity - shell.filled;
    if (charge !== null && charge > remaining) {
      reasons.push(`${shell.id} 剩余可灌药 ${remaining}g，本批 ${charge}g 超量`);
    }
    if (fuse && fuse.length < shell.height / 2) {
      reasons.push(
        `${shell.id} 壳高 ${shell.height}mm，引信 ${fuse.length}mm 不足壳高一半（需 ≥ ${Math.ceil(shell.height / 2)}mm）`
      );
    }
  }

  return { ok: reasons.length === 0, reasons, charge };
}

// 返工校验：只能减药（新药重必须低于上一次药重），并重新确认接地
export function assessRework(state: StoreState, form: ReworkForm): Assessment {
  const reasons: string[] = [];
  const charge = parseCharge(form.chargeText);
  const record = state.records.find(
    (r) => r.id === form.recordId && r.result === "passed"
  );

  if (!record) reasons.push("未找到可返工的合格批次");

  if (charge === null) {
    reasons.push("返工药重不是有效数字");
  } else if (charge < 0) {
    reasons.push("返工药重不能为负数");
  }

  if (!form.grounded) reasons.push("静电接地未重新确认");

  if (record && charge !== null && charge >= (record.chargeGrams ?? Number.POSITIVE_INFINITY)) {
    reasons.push(`返工只能减药：新药重 ${charge}g 必须小于当前药重 ${record.chargeGrams}g`);
  }

  return { ok: reasons.length === 0, reasons, charge };
}

function buildAssemblyRecord(
  state: StoreState,
  form: AssemblyForm,
  assessment: Assessment,
  time: string
): AssemblyRecord {
  const station = state.workstations.find((w) => w.id === form.stationId);
  const fuse = state.fuses.find((f) => f.id === form.fuseId);
  return {
    id: makeId("REC"),
    kind: "assembly",
    result: assessment.ok ? "passed" : "rejected",
    time,
    stationId: form.stationId,
    stationName: station?.name ?? form.stationId,
    shellIds: [...form.shellIds],
    shellCount: form.shellIds.length,
    chargeGrams: assessment.charge,
    fuseId: fuse?.id ?? null,
    fuseName: fuse ? `${fuse.name} ${fuse.length}mm` : null,
    grounded: form.grounded,
    reasons: assessment.reasons,
  };
}

function buildReworkRecord(
  state: StoreState,
  form: ReworkForm,
  assessment: Assessment,
  time: string
): AssemblyRecord | null {
  const parent = state.records.find(
    (r) => r.id === form.recordId && r.result === "passed"
  );
  if (!parent) return null;
  return {
    id: makeId("REC"),
    kind: "rework",
    result: assessment.ok ? "passed" : "rejected",
    time,
    stationId: parent.stationId,
    stationName: parent.stationName,
    shellIds: [...parent.shellIds],
    shellCount: parent.shellCount,
    chargeGrams: assessment.charge,
    fuseId: parent.fuseId,
    fuseName: parent.fuseName,
    grounded: form.grounded,
    reasons: assessment.reasons,
    parentId: parent.id,
    previousCharge: parent.chargeGrams ?? undefined,
  };
}

type Action =
  | { type: "submitAssembly"; form: AssemblyForm }
  | { type: "submitRework"; form: ReworkForm }
  | { type: "reset" };

// 通过时才扣减物料；退回时 reducer 返回原状态，工位和物料不动
function reducer(state: StoreState, action: Action): StoreState {
  const now = new Date().toISOString();

  if (action.type === "reset") {
    return createInitialState();
  }

  if (action.type === "submitAssembly") {
    const assessment = assessAssembly(state, action.form);
    const record = buildAssemblyRecord(state, action.form, assessment, now);
    if (!assessment.ok) {
      return { ...state, records: [record, ...state.records] };
    }
    const charge = assessment.charge!;
    return {
      ...state,
      shells: state.shells.map((s) =>
        action.form.shellIds.includes(s.id)
          ? {
              ...s,
              filled: s.filled + charge,
              status: "已装药",
              stationId: action.form.stationId,
              fuseId: action.form.fuseId,
              assembledAt: now,
            }
          : s
      ),
      fuses: state.fuses.map((f) =>
        f.id === action.form.fuseId ? { ...f, stock: f.stock - action.form.shellIds.length } : f
      ),
      records: [record, ...state.records],
    };
  }

  if (action.type === "submitRework") {
    const assessment = assessRework(state, action.form);
    const record = buildReworkRecord(state, action.form, assessment, now);
    if (!record) {
      return {
        ...state,
        records: [
          {
            id: makeId("REC"),
            kind: "rework",
            result: "rejected",
            time: now,
            stationId: "-",
            stationName: "-",
            shellIds: [],
            shellCount: 0,
            chargeGrams: assessment.charge,
            fuseId: null,
            fuseName: null,
            grounded: action.form.grounded,
            reasons: assessment.reasons.length ? assessment.reasons : ["返工批次不存在"],
          },
          ...state.records,
        ],
      };
    }
    if (!assessment.ok) {
      return { ...state, records: [record, ...state.records] };
    }
    const targetCharge = assessment.charge!;
    return {
      ...state,
      shells: state.shells.map((s) =>
        record.shellIds.includes(s.id)
          ? { ...s, filled: targetCharge, status: "已返工", assembledAt: now }
          : s
      ),
      records: [record, ...state.records],
    };
  }

  return state;
}

export function useAssemblyStore() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 本地存储不可用时静默，页面内存数据仍可用
    }
  }, [state]);

  const submitAssembly = (form: AssemblyForm) => dispatch({ type: "submitAssembly", form });
  const submitRework = (form: ReworkForm) => dispatch({ type: "submitRework", form });
  const reset = () => dispatch({ type: "reset" });

  return { state, submitAssembly, submitRework, reset };
}
