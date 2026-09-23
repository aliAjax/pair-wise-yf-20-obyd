import type { Fuse, Shell } from "./types";

interface InventoryProps {
  shells: Shell[];
  fuses: Fuse[];
}

function remaining(s: Shell): number {
  return s.capacity - s.filled;
}

/** 库存面板：八只弹壳（口径/壳高/剩余可灌药量）与四种引信 */
export function Inventory({ shells, fuses }: InventoryProps) {
  return (
    <section className="panel inventory">
      <div className="heading">
        <div>
          <p>物料台账</p>
          <h2>库存</h2>
        </div>
        <span className="hint">数据仅保存在本机浏览器</span>
      </div>

      <h3 className="sub-title">弹壳（8 只）</h3>
      <div className="shell-table-wrap">
        <table className="shell-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>口径 mm</th>
              <th>壳高 mm</th>
              <th>已灌 g</th>
              <th>剩余可灌 g</th>
              <th>引信最低长度</th>
              <th>状态</th>
              <th>所在工位</th>
            </tr>
          </thead>
          <tbody>
            {shells.map((s) => (
              <tr key={s.id} className={s.filled >= s.capacity ? "is-full" : ""}>
                <td className="mono">{s.id}</td>
                <td>{s.caliber}</td>
                <td>{s.height}</td>
                <td>
                  {s.filled} / {s.capacity}
                </td>
                <td>
                  <strong className={remaining(s) <= 0 ? "danger" : ""}>{remaining(s)}</strong>
                </td>
                <td>≥ {Math.ceil(s.height / 2)} mm</td>
                <td>
                  <span className={"status-badge status-" + s.status}>{s.status}</span>
                </td>
                <td>{s.stationId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="sub-title">引信（4 种）</h3>
      <div className="fuse-grid">
        {fuses.map((f) => (
          <article key={f.id} className="fuse-card">
            <header>
              <b>{f.name}</b>
              <span className="station-id">{f.id}</span>
            </header>
            <p className="fuse-length">
              长度 <strong>{f.length}</strong> mm
            </p>
            <p className="fuse-stock">
              库存 <strong className={f.stock === 0 ? "danger" : ""}>{f.stock}</strong> 根
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
