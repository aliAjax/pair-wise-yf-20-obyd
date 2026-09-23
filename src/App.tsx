import { useMemo, useState } from "react";
import "./styles.css";
import {
  AssembleInput,
  OperationResult,
  ReworkInput,
  WorkshopState,
  assemble,
  loadWorkshop,
  occupancyMap,
  resetWorkshop,
  rework,
  saveWorkshop,
} from "./inventory";
import { STATIONS, StationMap } from "./stations";

type Notice =
  | { type: "success"; text: string }
  | { type: "error"; title: string; errors: string[] }
  | null;

function App() {
  const [state, setState] = useState<WorkshopState>(() => loadWorkshop());
  const [mode, setMode] = useState<"assemble" | "rework">("assemble");
  const [notice, setNotice] = useState<Notice>(null);

  const occupancy = useMemo(() => occupancyMap(state), [state]);

  // 装配表单
  const idleStations = STATIONS.filter((s) => !occupancy.has(s.id));
  const usedShellIds = new Set(
    state.records.filter((r) => r.kind === "装配").map((r) => r.shellId)
  );
  const freeShells = state.shells.filter((s) => !usedShellIds.has(s.id));
  const [assembleForm, setAssembleForm] = useState<AssembleInput>({
    stationId: "",
    shellId: "",
    powder: 0,
    fuseId: state.fuses[0]?.id ?? "",
    fuseLength: 0,
    grounded: false,
  });

  // 返工表单
  const busyStations = STATIONS.filter((s) => occupancy.has(s.id));
  const [reworkStation, setReworkStation] = useState("");
  const [removePowder, setRemovePowder] = useState(0);
  const [reworkGrounded, setReworkGrounded] = useState(false);

  const effectiveAssembleStation = assembleForm.stationId || idleStations[0]?.id || "";
  const effectiveShell = assembleForm.shellId || freeShells[0]?.id || "";
  const effectiveReworkStation = reworkStation || busyStations[0]?.id || "";
  const reworkOcc = occupancy.get(effectiveReworkStation);

  function commit(result: OperationResult, okText: string) {
    if (result.ok) {
      setState(result.state);
      saveWorkshop(result.state);
      setNotice({ type: "success", text: `${okText} 批次号 ${result.record!.batch}，台账已存入本地。` });
      // 清空本次作业输入，避免连续作业沿用旧值
      setAssembleForm((f) => ({ ...f, powder: 0, fuseLength: 0, grounded: false }));
      setRemovePowder(0);
      setReworkGrounded(false);
    } else {
      setNotice({
        type: "error",
        title: "整批退回：原工位和物料未做任何改动",
        errors: result.errors,
      });
    }
  }

  function handleAssemble(event: React.FormEvent) {
    event.preventDefault();
    const input: AssembleInput = {
      ...assembleForm,
      stationId: effectiveAssembleStation,
      shellId: effectiveShell,
    };
    commit(assemble(state, input), "装配完成");
  }

  function handleRework(event: React.FormEvent) {
    event.preventDefault();
    if (!effectiveReworkStation) return;
    const input: ReworkInput = {
      stationId: effectiveReworkStation,
      remove: removePowder,
      grounded: reworkGrounded,
    };
    commit(rework(state, input), "返工完成");
  }

  function handleReset() {
    setState(resetWorkshop());
    setNotice({ type: "success", text: "已恢复预置台账：四条工位、八只弹壳、四种引信，本地记录已清空。" });
    setAssembleForm({ stationId: "", shellId: "", powder: 0, fuseId: "", fuseLength: 0, grounded: false });
    setReworkStation("");
    setRemovePowder(0);
    setReworkGrounded(false);
    setMode("assemble");
  }

  const totalPowderFilled = state.shells.reduce((sum, s) => sum + (s.capacity - s.remaining), 0);
  const fuseStockTotal = state.fuses.reduce((sum, f) => sum + f.stock, 0);

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62008 · 单页工位台 · 本地数据</p>
        <h1>烟花弹体装配工位台</h1>
        <span>
          预置四条工位、八只弹壳与四种引信。装配时选择工位、灌药克数与引信长度；静电接地未确认、灌药超出剩余可灌药量、
          或引信不足壳高一半时整批退回，原工位和物料不动。返工只能减药并重新确认接地，历史装配记录保留。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>预置工位</small>
          <strong>{STATIONS.length}</strong>
        </article>
        <article>
          <small>在制 / 空闲工位</small>
          <strong>
            {occupancy.size} / {STATIONS.length - occupancy.size}
          </strong>
        </article>
        <article>
          <small>弹壳剩余可灌药</small>
          <strong>
            {Math.round(state.shells.reduce((s, x) => s + x.remaining, 0))}
            <em> g</em>
          </strong>
        </article>
        <article>
          <small>装配 / 返工记录</small>
          <strong>
            {state.records.filter((r) => r.kind === "装配").length} /{" "}
            {state.records.filter((r) => r.kind === "返工").length}
          </strong>
        </article>
      </section>

      {notice &&
        (notice.type === "success" ? (
          <div className="banner success">{notice.text}</div>
        ) : (
          <div className="banner error">
            <b>{notice.title}</b>
            <ul>
              {notice.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ))}

      <div className="workspace">
        <StationMap
          occupancy={occupancy}
          selectedStation={mode === "assemble" ? effectiveAssembleStation : effectiveReworkStation}
          mode={mode}
          onSelect={(id) =>
            mode === "assemble"
              ? setAssembleForm((f) => ({ ...f, stationId: id }))
              : setReworkStation(id)
          }
        />

        <section className="panel form-panel">
          <div className="mode-tabs">
            <button
              type="button"
              className={mode === "assemble" ? "active" : ""}
              onClick={() => setMode("assemble")}
            >
              新装配
            </button>
            <button
              type="button"
              className={mode === "rework" ? "active" : ""}
              onClick={() => setMode("rework")}
            >
              工位返工（仅减药）
            </button>
          </div>

          {mode === "assemble" ? (
            <form className="work-form" onSubmit={handleAssemble}>
              <div className="heading">
                <div>
                  <p>装配作业</p>
                  <h2>新弹体装配</h2>
                </div>
                <button className="primary" type="submit">
                  提交装配
                </button>
              </div>

              {idleStations.length === 0 && (
                <p className="form-warn">四条工位均在制，请先完成返工腾出工位。</p>
              )}

              <div className="field-grid">
                <label className="full">
                  <span>选择工位（也可直接点左侧工位图）</span>
                  <select
                    value={effectiveAssembleStation}
                    onChange={(e) => setAssembleForm((f) => ({ ...f, stationId: e.target.value }))}
                  >
                    {idleStations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.name}（{s.area}）
                      </option>
                    ))}
                  </select>
                </label>

                <label className="full">
                  <span>选择弹壳（口径 / 壳高 / 剩余可灌药量）</span>
                  <select
                    value={effectiveShell}
                    onChange={(e) => setAssembleForm((f) => ({ ...f, shellId: e.target.value }))}
                  >
                    {freeShells.length === 0 && <option value="">八只弹壳均已上线</option>}
                    {freeShells.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.name}｜口径 {s.caliber}mm｜壳高 {s.height}mm｜余量 {s.remaining}g
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>灌药克数 (g)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={assembleForm.powder || ""}
                    placeholder="例如 120"
                    onChange={(e) =>
                      setAssembleForm((f) => ({ ...f, powder: Number(e.target.value) }))
                    }
                  />
                </label>

                <label>
                  <span>引信长度 (mm，不短于壳高一半)</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={assembleForm.fuseLength || ""}
                    placeholder="例如 120"
                    onChange={(e) =>
                      setAssembleForm((f) => ({ ...f, fuseLength: Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="full">
                  <span>选择引信</span>
                  <select
                    value={assembleForm.fuseId}
                    onChange={(e) => setAssembleForm((f) => ({ ...f, fuseId: e.target.value }))}
                  >
                    {state.fuses.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id} · {f.name}｜{f.burnRate}｜库存 {f.stock}mm
                      </option>
                    ))}
                  </select>
                </label>

                <label className="check full">
                  <input
                    type="checkbox"
                    checked={assembleForm.grounded}
                    onChange={(e) =>
                      setAssembleForm((f) => ({ ...f, grounded: e.target.checked }))
                    }
                  />
                  <span>
                    静电接地已确认（工位接地夹已连接，人体静电已释放）——未确认将整批退回
                  </span>
                </label>
              </div>
            </form>
          ) : (
            <form className="work-form" onSubmit={handleRework}>
              <div className="heading">
                <div>
                  <p>返工处理</p>
                  <h2>在制弹体返工</h2>
                </div>
                <button className="primary" type="submit">
                  提交返工
                </button>
              </div>

              {busyStations.length === 0 && (
                <p className="form-warn">当前没有在制工位，暂无可返工弹体。</p>
              )}

              <div className="field-grid">
                <label className="full">
                  <span>选择在制工位（也可直接点左侧工位图）</span>
                  <select
                    value={effectiveReworkStation}
                    onChange={(e) => setReworkStation(e.target.value)}
                    disabled={busyStations.length === 0}
                  >
                    {busyStations.map((s) => {
                      const occ = occupancy.get(s.id)!;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.id} · {s.name}｜{occ.shell.name}｜已灌 {occ.fill}g
                        </option>
                      );
                    })}
                  </select>
                </label>

                {reworkOcc && (
                  <div className="rework-context full">
                    <p>
                      原批次 <b>{reworkOcc.assembly.batch}</b>：{reworkOcc.shell.name}（
                      {reworkOcc.shell.caliber}mm / 壳高 {reworkOcc.shell.height}mm），
                      {reworkOcc.fuse.name} {reworkOcc.fuseLength}mm，
                      当前已灌药 <b>{reworkOcc.fill}g</b>，引信与工位不变，仅可减药。
                    </p>
                  </div>
                )}

                <label className="full">
                  <span>减药克数 (g，只能减、不能加)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={removePowder || ""}
                    placeholder="例如 20"
                    disabled={!reworkOcc}
                    onChange={(e) => setRemovePowder(Number(e.target.value))}
                  />
                </label>

                <label className="check full">
                  <input
                    type="checkbox"
                    checked={reworkGrounded}
                    disabled={!reworkOcc}
                    onChange={(e) => setReworkGrounded(e.target.checked)}
                  />
                  <span>已重新确认静电接地（返工必须再次确认）</span>
                </label>
              </div>
            </form>
          )}
        </section>
      </div>

      <section className="panel inventory">
        <div className="heading">
          <div>
            <p>库存台账</p>
            <h2>八只弹壳 · 四种引信（本地保存）</h2>
          </div>
          <button type="button" onClick={handleReset} className="reset-btn">
            恢复预置数据
          </button>
        </div>

        <div className="inventory-grid">
          <div>
            <h3>弹壳（口径 / 壳高 / 剩余可灌药量）</h3>
            <table>
              <thead>
                <tr>
                  <th>编号</th>
                  <th>口径</th>
                  <th>壳高</th>
                  <th>额定药量</th>
                  <th>剩余可灌</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {state.shells.map((s) => {
                  const online = usedShellIds.has(s.id);
                  const ratio = s.capacity === 0 ? 0 : (s.remaining / s.capacity) * 100;
                  return (
                    <tr key={s.id}>
                      <td>
                        {s.id} · {s.name}
                      </td>
                      <td>{s.caliber} mm</td>
                      <td>{s.height} mm</td>
                      <td>{s.capacity} g</td>
                      <td>
                        <div className="bar">
                          <i style={{ width: `${ratio}%` }} />
                        </div>
                        <b>{s.remaining} g</b>
                      </td>
                      <td>{online ? "已上线" : "待装配"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h3>引信（库存长度）</h3>
            <table>
              <thead>
                <tr>
                  <th>编号</th>
                  <th>名称</th>
                  <th>燃速</th>
                  <th>库存</th>
                </tr>
              </thead>
              <tbody>
                {state.fuses.map((f) => (
                  <tr key={f.id}>
                    <td>{f.id}</td>
                    <td>{f.name}</td>
                    <td>{f.burnRate}</td>
                    <td>{f.stock} mm</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="stock-note">引信库存合计 {fuseStockTotal} mm；已上线弹体总灌药 {Math.round(totalPowderFilled)} g。</p>
          </div>
        </div>
      </section>

      <section className="panel history">
        <div className="heading">
          <div>
            <p>装配历史（只追加）</p>
            <h2>作业记录 · 共 {state.records.length} 条</h2>
          </div>
        </div>
        {state.records.length === 0 ? (
          <p className="empty">暂无装配记录。被整批退回的作业不会写入历史。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>批次号</th>
                <th>类型</th>
                <th>工位</th>
                <th>弹壳 / 口径</th>
                <th>引信 / 长度</th>
                <th>灌药 / 减药</th>
                <th>操作后总药量</th>
                <th>接地</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {[...state.records].reverse().map((r) => (
                <tr key={r.batch} className={r.kind === "返工" ? "rework-row" : ""}>
                  <td>
                    <b>{r.batch}</b>
                    {r.reworkBatch && <small>（原批 {r.reworkBatch}）</small>}
                  </td>
                  <td>
                    <span className={"tag " + (r.kind === "返工" ? "tag-rework" : "tag-ok")}>
                      {r.kind}
                    </span>
                  </td>
                  <td>{r.stationId}</td>
                  <td>
                    {r.shellName} · {r.caliber}mm
                  </td>
                  <td>
                    {r.fuseName} · {r.fuseLength}mm
                  </td>
                  <td>{r.kind === "返工" ? `−${r.powder} g` : `${r.powder} g`}</td>
                  <td>{r.fillAfter} g</td>
                  <td>{r.grounded ? "已确认" : "—"}</td>
                  <td>{r.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default App;
