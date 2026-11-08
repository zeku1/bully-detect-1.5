import React, { useState } from "react";
import { Camera } from "../types";
import { Video, AlertTriangle, Settings, Trash2, Tag, Maximize } from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface CameraWallProps {
  cameras: Camera[];
  slots: 1 | 4 | 9;
  onFocusCamera: (id: number) => void;
  activeAlertCameraIds: Set<number>;
  onEditCamera: (camera: Camera) => void;
  onDeleteCamera: (id: number) => void;
  yoloLabelsEnabled?: boolean;
}

export const CameraWall: React.FC<CameraWallProps> = ({ cameras, slots, onFocusCamera, activeAlertCameraIds, onEditCamera, onDeleteCamera, yoloLabelsEnabled = true }) => {
  const { hasRole } = useAuth();
  const [cameraOverrides, setCameraOverrides] = useState<Record<number, boolean>>({});

  return (
    <div className={"cctv-grid cctv-grid-" + slots}>
      {cameras.map(camera => {
        const isAlerting = activeAlertCameraIds.has(camera.id);
        const isOnline = (camera.runtime_status ?? camera.status) === "ONLINE";
        const prediction = camera.latest_prediction;
        const labelsOn = cameraOverrides[camera.id] ?? yoloLabelsEnabled;
        return (
          <article key={camera.id} className={"camera-tile " + (isAlerting ? "camera-tile-alert" : "")} aria-label={camera.name}>
            <div className="camera-tile-heading">
              <span className={"h-1.5 w-1.5 rounded-full shrink-0 " + (isOnline ? "bg-emerald-400" : "bg-slate-500")} />
              <h2 className="truncate flex-1 text-xs font-medium" title={camera.name}>{camera.name}</h2>
              <button className="tile-button" aria-label={"Focus " + camera.name} onClick={() => onFocusCamera(camera.id)}><Maximize size={13} /></button>
              <button className="tile-button" aria-label={"Detection labels for " + camera.name} aria-pressed={labelsOn} onClick={() => setCameraOverrides(prev => ({ ...prev, [camera.id]: !(prev[camera.id] ?? yoloLabelsEnabled) }))}><Tag size={13} /></button>
              {hasRole(["admin"]) && <>
                <button className="tile-button" aria-label={"Configure " + camera.name} onClick={() => onEditCamera(camera)}><Settings size={13} /></button>
                <button className="tile-button hover:text-red-400" aria-label={"Remove " + camera.name} onClick={() => onDeleteCamera(camera.id)}><Trash2 size={13} /></button>
              </>}
            </div>
            <div className="camera-viewport" onDoubleClick={() => onFocusCamera(camera.id)}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                <Video size={26} strokeWidth={1} />
                <span>{isOnline ? "Waiting for video" : "Camera offline"}</span>
              </div>
              {isOnline && <img
                src={"http://localhost:5000/api/stream/" + camera.id + "/live?labels=" + (labelsOn ? 1 : 0)}
                alt={camera.name}
                className="relative w-full h-full object-contain"
                onLoad={event => { event.currentTarget.style.visibility = "visible"; }}
                onError={event => { event.currentTarget.style.visibility = "hidden"; }}
              />}
              <div className="absolute top-2 left-2 flex gap-2 text-[10px] font-medium tracking-wider text-slate-300 bg-black/70 px-2 py-1 rounded-sm">
                <span>{camera.is_simulation ? "SIMULATION" : isOnline ? "LIVE" : "OFFLINE"}</span>
              </div>
              {(isAlerting || (camera.ai_enabled && isOnline && prediction?.is_violent)) && <div className="absolute bottom-0 inset-x-0 flex items-center gap-2 bg-red-950/90 text-red-200 px-2 py-1.5 text-[10px] font-medium"><AlertTriangle size={12} className="shrink-0" /><span className="truncate">{isAlerting ? "Incident awaiting review" : prediction?.category || "Suspected violence"}</span></div>}
            </div>
            {camera.ai_enabled && isOnline && prediction && <div className="camera-tile-footer text-slate-500">
              <span>{camera.sampling_rate} FPS · {prediction.latency_ms.toFixed(0)}ms</span>
              {prediction.person_count !== undefined && <span>{prediction.person_count} {prediction.person_count === 1 ? "person" : "people"}</span>}
            </div>}
            <div className="camera-tile-footer">
              <span className="truncate" title={camera.location}>{camera.location || "No location"}</span>
              <span className="shrink-0">{!camera.ai_enabled ? "AI disabled" : !isOnline ? "Offline" : prediction ? (prediction.confidence * 100).toFixed(0) + "% confidence" : "AI waiting"}</span>
            </div>
          </article>
        );
      })}
      {Array.from({ length: Math.max(0, slots - cameras.length) }, (_, index) => <div key={"empty-" + index} className="camera-empty" aria-label="Empty camera slot"><Video size={25} strokeWidth={1} /><span>No camera assigned</span></div>)}
    </div>
  );
};
