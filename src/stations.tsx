// 工位图业务：四条预置工位定义与在制状态可视化
import type { Occupancy } from "./inventory";

export interface Station {
  id: string;
  name: string;
  area: string; // 厂房分区
  note: string; // 工位职责
}

/** 预置四条工位 */
export const STATIONS: Station[] = [
  { id: "GW-1", name: "一号工位", area: "甲区·防静电间", note: "小口径初装" },
  { id: "GW-2", name: "二号工位", area: "甲区·防静电间", note: "中口径装配" },
  { id: "GW-3", name: "三号工位", area: "乙区·浇筑线", note: "大口径浇筑" },
  { id: "GW-4", name: "四号工位", area: "乙区·浇筑线", note: "超大口径装配" },
];

interface StationMapProps {
  occupancy: Map<string, Occupancy>;
  selectedStation: string;
  mode: "assemble" | "rework";
  onSelect: (stationId: string) => void;
}

export function StationMap({ occupancy, selectedStation, mode, onSelect }: StationMapProps) {
  return (
    <section className="panel station-panel">
      <div className="heading">
        <div>
          <p>工位图</p>
          <h2>四条装配工位</h2>
        </div>
        <span className="legend">
          <i className="dot idle" /> 空工位
          <i className="dot busy" /> 在制
        </span>
      </div>

      <div className="station-grid">
        {STATIONS.map((station) => {
          const occ = occupancy.get(station.id);
          const selectable = mode === "assemble" ? !occ : Boolean(occ);
          const active = selectedStation === station.id;
          return (
            <button
              type="button"
              key={station.id}
              className={[
                "station-card",
                occ ? "busy" : "idle",
                active ? "active" : "",
                selectable ? "" : "locked",
              ].join(" ")}
              onClick={() => selectable && onSelect(station.id)}
              disabled={!selectable}
              title={selectable ? `选择${station.name}` : occ ? "工位在制，请走返工" : "该工位无在制弹体"}
            >
              <div className="station-head">
                <b>{station.id}</b>
                <span className="status">{occ ? "在制" : "空闲"}</span>
              </div>
              <h3>{station.name}</h3>
              <p className="area">{station.area}</p>
              <p className="note">{station.note}</p>

              {occ && (
                <dl className="occ">
                  <div>
                    <dt>弹壳</dt>
                    <dd>
                      {occ.shell.name}（{occ.shell.caliber}mm）
                    </dd>
                  </div>
                  <div>
                    <dt>已灌药</dt>
                    <dd>
                      {occ.fill} / {occ.shell.capacity} g
                    </dd>
                  </div>
                  <div>
                    <dt>引信</dt>
                    <dd>
                      {occ.fuse.name} · {occ.fuseLength}mm
                    </dd>
                  </div>
                  <div>
                    <dt>接地</dt>
                    <dd className={occ.grounded ? "ok" : "warn"}>
                      {occ.grounded ? "已确认" : "待重新确认"}
                    </dd>
                  </div>
                </dl>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
