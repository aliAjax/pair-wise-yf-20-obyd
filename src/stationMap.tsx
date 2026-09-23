import type { Shell, Workstation } from "./types";

interface StationMapProps {
  workstations: Workstation[];
  shells: Shell[];
  activeStationId: string;
}

const statusText: Record<Shell["status"], string> = {
  空壳: "空壳",
  已装药: "已装药",
  已返工: "已返工",
};

/** 工位平面图：四条工位按 A/B 两区排布，显示各工位上停留的弹壳 */
export function StationMap({ workstations, shells, activeStationId }: StationMapProps) {
  const zones: Workstation["zone"][] = ["A区", "B区"];

  return (
    <section className="panel station-map">
      <div className="heading">
        <div>
          <p>车间平面</p>
          <h2>工位图</h2>
        </div>
        <span className="hint">弹壳装配合格后进入所选工位；整批退回时工位与物料均不变动</span>
      </div>

      <div className="zones">
        {zones.map((zone) => (
          <div className="zone" key={zone}>
            <h3>{zone}（静电防护地面）</h3>
            <div className="station-grid">
              {workstations
                .filter((w) => w.zone === zone)
                .map((w) => {
                  const here = shells.filter((s) => s.stationId === w.id);
                  const active = w.id === activeStationId;
                  return (
                    <article
                      key={w.id}
                      className={"station-card" + (active ? " active" : "")}
                    >
                      <header>
                        <b>{w.name}</b>
                        <span className="station-id">{w.id}</span>
                      </header>
                      <p className="station-note">{w.note}</p>
                      <div className="station-shells">
                        {here.length === 0 ? (
                          <span className="empty-slot">工位空闲</span>
                        ) : (
                          here.map((s) => (
                            <span
                              key={s.id}
                              className={"shell-pill " + (s.status === "已返工" ? "reworked" : "")}
                              title={`口径 ${s.caliber}mm · 壳高 ${s.height}mm · 已灌 ${s.filled}/${s.capacity}g`}
                            >
                              {s.id}
                              <em>{statusText[s.status]}</em>
                            </span>
                          ))
                        )}
                      </div>
                      <footer>在台弹壳 {here.length} 只</footer>
                    </article>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
