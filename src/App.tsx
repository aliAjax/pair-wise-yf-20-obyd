import { useMemo, useState } from "react";
import { assessAssembly, assessRework, useAssemblyStore } from "./store";
import { StationMap } from "./stationMap";
import { Inventory } from "./inventory";
import type { AssemblyForm, AssemblyRecord, ReworkForm } from "./types";

interface SubmitNotice {
  kind: "assembly" | "rework";
  ok: boolean;
  reasons: string[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { hour12: false });
}

function isReworkable(record: AssemblyRecord, filledOf: Map<string, number>): boolean {
  if (record.result !== "passed" || record.chargeGrams === null) return false;
  if (record.shellIds.length === 0) return false;
  // 只有该批次药重仍是弹壳当前药重（即未被后续返工取代）时才可继续返工
  return record.shellIds.every((id) => filledOf.get(id) === record.chargeGrams);
}

function AssemblyDesk() {
  const { state, submitAssembly, submitRework, reset } = useAssemblyStore();

  const [form, setForm] = useState<AssemblyForm>({
    stationId: state.workstations[0]?.id ?? "",
    shellIds: [],
    chargeText: "",
    fuseId: state.fuses[0]?.id ?? "",
    grounded: false,
  });
  const [notice, setNotice] = useState<SubmitNotice | null>(null);

  // 实时预检，不改动任何数据
  const preflight = useMemo(
    () => assessAssembly(state, form),
    [state, form]
  );

  const toggleShell = (id: string) => {
    setForm((f) => ({
      ...f,
      shellIds: f.shellIds.includes(id)
        ? f.shellIds.filter((x) => x !== id)
        : [...f.shellIds, id],
    }));
  };

  const handleSubmit = () => {
    // 预检与 reducer 基于同一 state/form 计算，结论必然一致
    const ok = preflight.ok;
    const reasons = preflight.reasons;
    submitAssembly(form);
    if (ok) {
      // 已选弹壳均已上工位装配，清空选择与克数，接地状态保留供下一批
      setForm((f) => ({ ...f, shellIds: [], chargeText: "" }));
    }
    setNotice({ kind: "assembly", ok, reasons });
  };

  const [reworkTargetId, setReworkTargetId] = useState<string | null>(null);
  const [reworkForm, setReworkForm] = useState<ReworkForm>({
    recordId: "",
    chargeText: "",
    grounded: false,
  });
  const [reworkNotice, setReworkNotice] = useState<Omit<SubmitNotice, "recordId"> | null>(null);

  const filledOf = useMemo(
    () => new Map(state.shells.map((s) => [s.id, s.filled])),
    [state.shells]
  );

  const reworkTarget = state.records.find((r) => r.id === reworkTargetId) ?? null;
  const reworkPreflight = useMemo(() => {
    if (!reworkTarget) return null;
    return assessRework(state, { ...reworkForm, recordId: reworkTarget.id });
  }, [state, reworkForm, reworkTarget]);

  const openRework = (recordId: string) => {
    setReworkTargetId(recordId);
    setReworkForm({ recordId, chargeText: "", grounded: false });
    setReworkNotice(null);
  };

  const closeRework = () => {
    setReworkTargetId(null);
    setReworkNotice(null);
  };

  const handleReworkSubmit = () => {
    if (!reworkTarget) return;
    const ok = reworkPreflight?.ok ?? false;
    const reasons = reworkPreflight?.reasons ?? [];
    submitRework({ ...reworkForm, recordId: reworkTarget.id });
    if (ok) {
      // 成功后该批次已被新返工取代，关闭弹窗并在主面板提示
      setReworkTargetId(null);
      setNotice({ kind: "rework", ok: true, reasons: [] });
    } else {
      setReworkNotice({ kind: "rework", ok: false, reasons });
    }
  };

  const handleReset = () => {
    if (window.confirm("确定清空本机装配数据并恢复预置工位、弹壳与引信？")) {
      reset();
      setNotice(null);
      setReworkNotice(null);
      setReworkTargetId(null);
      setForm((f) => ({ ...f, shellIds: [], chargeText: "", grounded: false }));
    }
  };

  const stats = useMemo(() => {
    const remaining = state.shells.reduce((sum, s) => sum + (s.capacity - s.filled), 0);
    const fuseStock = state.fuses.reduce((sum, f) => sum + f.stock, 0);
    const passed = state.records.filter((r) => r.result === "passed").length;
    const rejected = state.records.filter((r) => r.result === "rejected").length;
    return { remaining, fuseStock, passed, rejected };
  }, [state]);

  const selectedFuse = state.fuses.find((f) => f.id === form.fuseId);

  return (
    <main className="app">
      <section className="hero">
        <p>单页工位台 · 端口 62008 · 数据仅存本机</p>
        <h1>烟花弹体装配工位台</h1>
        <span>
          预置四条工位、八只弹壳与四种引信。按批选择工位、弹壳、灌药克数与引信长度；
          静电接地未确认、灌药超过余量或引信不足壳高一半时，整批退回，原工位与物料不动。
          返工只能减药并重新确认接地，历史装配全程保留。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>剩余可灌药总量</small>
          <strong>
            {stats.remaining}
            <em>g</em>
          </strong>
        </article>
        <article>
          <small>引信库存</small>
          <strong>
            {stats.fuseStock}
            <em>根</em>
          </strong>
        </article>
        <article>
          <small>合格批次</small>
          <strong>{stats.passed}</strong>
        </article>
        <article>
          <small>整批退回</small>
          <strong className={stats.rejected > 0 ? "metric-danger" : ""}>{stats.rejected}</strong>
        </article>
      </section>

      {/* 业务文件一：装配页面（本组件） */}
      <section className="panel assembly-panel">
        <div className="heading">
          <div>
            <p>装配作业</p>
            <h2>新建装配批次</h2>
          </div>
          <button className="ghost-btn" onClick={handleReset}>
            恢复预置数据
          </button>
        </div>

        {notice && (
          <div className={"notice " + (notice.ok ? "notice-ok" : "notice-bad")}>
            <div>
              <b>
                {notice.ok
                  ? notice.kind === "rework"
                    ? "返工合格，已按新药重入库"
                    : "装配合格，已入库上工位"
                  : notice.kind === "rework"
                    ? "返工被退回：物料未动"
                    : "整批退回：原工位与物料未动"}
              </b>
              {!notice.ok && (
                <ul>
                  {notice.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
            <button className="notice-close" onClick={() => setNotice(null)} aria-label="关闭提示">
              ×
            </button>
          </div>
        )}

        <div className="assembly-grid">
          <label className="field">
            <span>选择工位</span>
            <select
              value={form.stationId}
              onChange={(e) => setForm((f) => ({ ...f, stationId: e.target.value }))}
            >
              {state.workstations.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}（{w.id} · {w.zone}）
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>灌药克数（g，每只弹壳相同）</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="例如 60"
              value={form.chargeText}
              onChange={(e) => setForm((f) => ({ ...f, chargeText: e.target.value }))}
            />
          </label>

          <label className="field">
            <span>选择引信</span>
            <select
              value={form.fuseId}
              onChange={(e) => setForm((f) => ({ ...f, fuseId: e.target.value }))}
            >
              {state.fuses.map((f) => (
                <option key={f.id} value={f.id} disabled={f.stock === 0}>
                  {f.name} · {f.length}mm · 库存 {f.stock} 根
                </option>
              ))}
            </select>
          </label>

          <label className={"field ground-field" + (form.grounded ? " confirmed" : "")}>
            <span>静电接地确认</span>
            <label className="check-line">
              <input
                type="checkbox"
                checked={form.grounded}
                onChange={(e) => setForm((f) => ({ ...f, grounded: e.target.checked }))}
              />
              已确认本工位静电接地完好（必检）
            </label>
          </label>
        </div>

        <div className="shell-pick">
          <div className="shell-pick-head">
            <span>勾选本批弹壳（已选 {form.shellIds.length} 只）</span>
            {selectedFuse && (
              <span className="hint">
                当前引信 {selectedFuse.length}mm，可配壳高上限 {selectedFuse.length * 2}mm
              </span>
            )}
          </div>
          <div className="shell-checks">
            {state.shells.map((s) => {
              const remaining = s.capacity - s.filled;
              const assembled = s.status !== "空壳";
              return (
                <label
                  key={s.id}
                  className={
                    "shell-check" +
                    (form.shellIds.includes(s.id) ? " picked" : "") +
                    (assembled ? " disabled" : "")
                  }
                >
                  <input
                    type="checkbox"
                    checked={form.shellIds.includes(s.id)}
                    disabled={assembled}
                    onChange={() => toggleShell(s.id)}
                  />
                  <span className="mono">{s.id}</span>
                  <span>
                    口径 {s.caliber} · 壳高 {s.height}mm
                  </span>
                  {assembled ? (
                    <span>已装配，需返工</span>
                  ) : (
                    <span>余 {remaining}g</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <div className="preflight">
          <b>提交前预检</b>
          {preflight.ok ? (
            <p className="preflight-ok">预检通过：本批 {form.shellIds.length} 只可提交装配。</p>
          ) : (
            <ul className="preflight-bad">
              {preflight.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="submit-row">
          <button className="primary" onClick={handleSubmit}>
            提交整批装配
          </button>
          <span className="hint">不通过将整批退回，仅追加一条退回记录，库存、工位与引信不变。</span>
        </div>
      </section>

      <div className="biz-grid">
        {/* 业务文件二：工位图 */}
        <StationMap
          workstations={state.workstations}
          shells={state.shells}
          activeStationId={form.stationId}
        />
        {/* 业务文件三：库存 */}
        <Inventory shells={state.shells} fuses={state.fuses} />
      </div>

      {/* 历史装配保留：只追加 */}
      <section className="panel history-panel">
        <div className="heading">
          <div>
            <p>批次台账</p>
            <h2>历史装配与返工（{state.records.length}）</h2>
          </div>
          <span className="hint">历史记录只追加、不修改；返工只能减药</span>
        </div>

        {state.records.length === 0 ? (
          <p className="empty-history">暂无批次，先在上方提交一批装配。</p>
        ) : (
          <div className="records">
            {state.records.map((r) => {
              const reworkable = isReworkable(r, filledOf);
              return (
                <article key={r.id} className={"record-card result-" + r.result}>
                  <div className="record-top">
                    <div className="record-badges">
                      <span className={"kind-badge kind-" + r.kind}>
                        {r.kind === "assembly" ? "装配" : "返工"}
                      </span>
                      <span className={"result-badge result-" + r.result}>
                        {r.result === "passed" ? "合格入库" : "整批退回"}
                      </span>
                      {r.kind === "rework" && r.parentId && (
                        <span className="parent-tag" title={r.parentId}>
                          基于批次 {r.parentId.slice(-6).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <time>{formatTime(r.time)}</time>
                  </div>
                  <div className="record-body">
                    <p>
                      <b>{r.stationName}</b> · 弹壳 {r.shellIds.length} 只（
                      {r.shellIds.join("、") || "—"}）
                    </p>
                    <p className="record-detail">
                      {r.kind === "rework" && r.previousCharge !== undefined ? (
                        <>
                          药重 {r.previousCharge}g → <b>{r.chargeGrams ?? "—"}g</b>（减药返工） ·
                        </>
                      ) : (
                        <>灌药 {r.chargeGrams ?? "—"}g ·</>
                      )}{" "}
                      引信 {r.fuseName ?? "—"} · 静电接地{r.grounded ? "已确认" : "未确认"}
                    </p>
                    {r.result === "rejected" && r.reasons.length > 0 && (
                      <ul className="reject-reasons">
                        {r.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {r.result === "passed" && (
                    <button
                      className="ghost-btn rework-btn"
                      disabled={!reworkable}
                      title={reworkable ? "对该批次发起减药返工" : "已被后续返工取代"}
                      onClick={() => openRework(r.id)}
                    >
                      返工（减药）
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {reworkTarget && (
        <div className="modal-mask" onClick={closeRework}>
          <section className="panel modal" onClick={(e) => e.stopPropagation()}>
            <div className="heading">
              <div>
                <p>返工处理</p>
                <h2>减药返工 · {reworkTarget.stationName}</h2>
              </div>
              <button className="notice-close" onClick={closeRework} aria-label="关闭">
                ×
              </button>
            </div>

            <p className="hint">
              批次 {reworkTarget.id.slice(-8).toUpperCase()} · 弹壳{" "}
              {reworkTarget.shellIds.join("、")} · 当前药重 {reworkTarget.chargeGrams}g。
              返工只能减药，并须重新确认静电接地；引信与工位不变，历史装配保留。
            </p>

            {reworkNotice && !reworkNotice.ok && (
              <div className="notice notice-bad">
                <div>
                  <b>返工被退回：物料未动</b>
                  <ul>
                    {reworkNotice.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <button
                  className="notice-close"
                  onClick={() => setReworkNotice(null)}
                  aria-label="关闭提示"
                >
                  ×
                </button>
              </div>
            )}

            <label className="field">
              <span>返工后药重（g，必须小于 {reworkTarget.chargeGrams}g）</span>
              <input
                type="number"
                min="0"
                step="1"
                autoFocus
                value={reworkForm.chargeText}
                onChange={(e) =>
                  setReworkForm((f) => ({ ...f, chargeText: e.target.value }))
                }
              />
            </label>

            <label className="check-line rework-check">
              <input
                type="checkbox"
                checked={reworkForm.grounded}
                onChange={(e) =>
                  setReworkForm((f) => ({ ...f, grounded: e.target.checked }))
                }
              />
              已重新确认静电接地完好
            </label>

            {reworkPreflight && !reworkPreflight.ok && (
              <ul className="preflight-bad">
                {reworkPreflight.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}

            <div className="submit-row">
              <button className="primary" onClick={handleReworkSubmit}>
                提交返工
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  return <AssemblyDesk />;
}
