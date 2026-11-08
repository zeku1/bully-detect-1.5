import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Header } from "../components/Header";
import { CameraWall } from "../components/CameraWall";
import { AlertQueue } from "../components/AlertQueue";
import { IncidentReviewModal } from "../components/IncidentReviewModal";
import { CameraModal } from "../components/CameraModal";
import { Camera, Incident } from "../types";
import { playAlertChime } from "../utils/audio";
import { useAuth } from "../context/AuthContext";

import { Video, ChevronLeft, ChevronRight, Maximize, Minimize, Grid2X2, PanelLeft, ArrowLeft, Bell } from "lucide-react";

const API_BASE = "http://localhost:5000/api";

export default function SurveillancePage() {
  const { authFetch, user } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [modalInitialMode, setModalInitialMode] = useState<"upload" | "library" | "rtsp">("upload");
  const [yoloLabelsEnabled, setYoloLabelsEnabled] = useState(true);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<1 | 4 | 9>(4);
  const [page, setPage] = useState(0);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [cameraListOpen, setCameraListOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const focusedCamera = cameras.find(camera => camera.id === focusedId);
  const pageCount = Math.max(1, Math.ceil(cameras.length / layout));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleCameras = focusedCamera ? [focusedCamera] : cameras.slice(currentPage * layout, (currentPage + 1) * layout);

  useEffect(() => { setPage(currentPage); }, [currentPage]);
  useEffect(() => {
    if (focusedId !== null && !focusedCamera) setFocusedId(null);
  }, [focusedId, focusedCamera]);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await workspaceRef.current?.requestFullscreen();
    } catch {
      setFullscreenError("Fullscreen is unavailable in this browser. You can continue monitoring here.");
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cctv_yolo_labels");
      if (saved !== null) {
        setYoloLabelsEnabled(saved === "1");
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, []);

  const handleToggleYoloLabels = () => {
    setYoloLabelsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("cctv_yolo_labels", next ? "1" : "0");
      } catch (e) {}
      return next;
    });
  };

  // Fetch cameras
  const fetchCameras = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/cameras`);
      if (res.ok) {
        const data = await res.json();
        setCameras(data);
      }
    } catch (e) {
      // Backend might still be starting
    }
  }, [authFetch]);

  // Fetch active incidents (awaiting review)
  const fetchIncidents = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/incidents?status=AWAITING_REVIEW`);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch (e) {
      // Backend offline
    }
  }, [authFetch]);


  // Initial load and periodic polling for camera stats
  useEffect(() => {
    fetchCameras();
    fetchIncidents();
    const interval = setInterval(() => {
      fetchCameras();
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchCameras, fetchIncidents]);

  // Connect to SSE for instant real-time alerts
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${API_BASE}/events`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "incident.created") {
            if (soundEnabled) {
              playAlertChime();
            }
            fetchIncidents();
            fetchCameras();
          } else if (data.type === "incident.clip_ready") {
            setSelectedIncident((prev) => {
              if (prev && prev.id === data.incident_id) {
                return {
                  ...prev,
                  clip_status: "READY",
                  clip_url: data.clip_url || `/api/incidents/${data.incident_id}/clip`,
                  thumbnail_url: data.thumbnail_url || prev.thumbnail_url,
                };
              }
              return prev;
            });
            fetchIncidents();
          } else if (data.type === "incident.acknowledged" || data.type === "incident.reviewed") {
            fetchIncidents();
          }
        } catch (err) {
          // ignore heartbeat
        }
      };

      eventSource.onerror = () => {
        // SSE reconnects automatically
      };
    } catch (err) {
      console.warn("SSE connection error:", err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [soundEnabled, fetchIncidents, fetchCameras]);

  // Set of camera IDs that currently have active alerts
  const activeAlertCameraIds = useMemo(() => {
    return new Set(incidents.map((i) => i.camera_id));
  }, [incidents]);

  // Acknowledge incident
  const handleAcknowledge = async (incidentId: number) => {
    try {
      await authFetch(`${API_BASE}/incidents/${incidentId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator: user?.name || "Security Operator" }),
      });
      fetchIncidents();
    } catch (e) {
      console.error("Failed to acknowledge incident:", e);
    }
  };

  // Submit human review
  const handleSubmitReview = async (reviewData: {
    incidentId: number;
    classification: string;
    reason?: string;
    notes?: string;
    reviewer?: string;
  }) => {
    await authFetch(`${API_BASE}/incidents/${reviewData.incidentId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classification: reviewData.classification,
        reason: reviewData.reason,
        notes: reviewData.notes,
        reviewer: reviewData.reviewer || user?.name || "Operator",
      }),
    });
    fetchIncidents();
    fetchCameras();
  };

  // Save (Create or Update) camera
  const handleSaveCamera = async (camData: Partial<Camera>) => {
    try {
      if (editingCamera?.id) {
        await authFetch(`${API_BASE}/cameras/${editingCamera.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(camData),
        });
      } else {
        await authFetch(`${API_BASE}/cameras`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(camData),
        });
      }
      fetchCameras();
    } catch (e) {
      console.error("Failed to save camera:", e);
    }
  };

  // Delete camera
  const handleDeleteCamera = async (id: number) => {
    if (confirm("Are you sure you want to remove this camera?")) {
      try {
        await authFetch(`${API_BASE}/cameras/${id}`, { method: "DELETE" });
        fetchCameras();
      } catch (e) {
        console.error("Failed to delete camera:", e);
      }
    }
  };

  return (
    <div ref={workspaceRef} className="monitor-workspace">
      <Header
        cameraCount={cameras.length}
        activeAlertCount={incidents.length}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        yoloLabelsEnabled={yoloLabelsEnabled}
        onToggleYoloLabels={handleToggleYoloLabels}
        onUploadSimulation={() => {
          setEditingCamera(null);
          setModalInitialMode("upload");
          setCameraModalOpen(true);
        }}
        onAddCamera={() => {
          setEditingCamera(null);
          setModalInitialMode("upload");
          setCameraModalOpen(true);
        }}
      />

      <main id="main-content" tabIndex={-1} className="monitor-main">
        <div className="monitor-toolbar">
          <div className="flex items-center gap-3">
            <button className="console-button lg:hidden" aria-label="Toggle camera list" aria-expanded={cameraListOpen} aria-controls="camera-directory" onClick={() => setCameraListOpen(!cameraListOpen)}><PanelLeft size={16} /></button>
            <h1 className="text-sm font-semibold text-white">Live monitoring</h1>
            <span className="hidden sm:inline text-xs text-slate-400 border-l border-sentinel-border pl-3">{cameras.length} cameras</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {focusedCamera && <button className="console-button" onClick={() => setFocusedId(null)}><ArrowLeft size={14} />Back to grid</button>}
            <div className="flex items-center gap-1" role="group" aria-label="Camera layout">
              {([1, 4, 9] as const).map(size => <button key={size} className="console-button" aria-label={size + " camera layout"} aria-pressed={!focusedCamera && layout === size} onClick={() => { setLayout(size); setPage(0); setFocusedId(null); }}><Grid2X2 size={13} />{size}</button>)}
            </div>
            <button className="console-button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}<span className="hidden sm:inline">{fullscreen ? "Exit fullscreen" : "Fullscreen"}</span></button>
          </div>
        </div>
        {fullscreenError && <p role="status" className="px-4 py-2 text-xs text-amber-300">{fullscreenError}</p>}
        <div className="monitor-columns">
          <aside id="camera-directory" aria-label="Camera directory" className={"camera-directory " + (cameraListOpen ? "block" : "hidden lg:block")}>
            <div className="console-panel-heading"><span>CAMERAS</span><span className="text-slate-500 tabular-nums">{cameras.length}</span></div>
            <div className="p-2 space-y-1">
              {cameras.length === 0 && <p className="p-3 text-xs text-slate-400">No cameras registered.</p>}
              {cameras.map(camera => {
                const online = (camera.runtime_status ?? camera.status) === "ONLINE";
                return <button key={camera.id} className="camera-directory-item" aria-pressed={focusedId === camera.id} onClick={() => { setFocusedId(camera.id); setCameraListOpen(false); }} title={camera.name + " - " + camera.location}>
                  <Video size={16} className={online ? "text-emerald-400 shrink-0" : "text-slate-500 shrink-0"} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-200">{camera.name}</span><span className="block truncate text-[11px] text-slate-500 mt-1">{camera.location}</span><span className="block text-[10px] text-slate-400 mt-1">{online ? "Online" : "Offline"}{camera.is_simulation ? " / Simulation" : ""}</span></span>
                  {activeAlertCameraIds.has(camera.id) && <Bell size={13} className="text-red-400 shrink-0" aria-label="Incident awaiting review" />}
                </button>;
              })}
            </div>
          </aside>
          <section className="monitor-wall" aria-label="Live camera wall">
            <div className="flex items-center justify-between px-1 pb-2 text-[11px] text-slate-400">
              <span className="uppercase tracking-wider">{focusedCamera ? "Camera focus" : "Camera wall"}</span>
              <span>{focusedCamera ? focusedCamera.name : layout + "-camera view"}</span>
            </div>
            <CameraWall cameras={visibleCameras} slots={focusedCamera ? 1 : layout} onFocusCamera={setFocusedId}
              activeAlertCameraIds={activeAlertCameraIds} yoloLabelsEnabled={yoloLabelsEnabled}
              onEditCamera={(cam) => { setEditingCamera(cam); setModalInitialMode(cam.is_simulation ? "library" : "rtsp"); setCameraModalOpen(true); }}
              onDeleteCamera={handleDeleteCamera} />
            <div className="wall-statusbar">
              <span>{focusedCamera ? "Single camera focus" : cameras.length === 0 ? "Add a camera to begin monitoring" : "Cameras " + (currentPage * layout + 1) + "-" + Math.min((currentPage + 1) * layout, cameras.length) + " of " + cameras.length}</span>
              {!focusedCamera && pageCount > 1 && <div className="flex items-center gap-2">
                <button className="console-button" aria-label="Previous cameras" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></button>
                <span aria-live="polite">{currentPage + 1} / {pageCount}</span>
                <button className="console-button" aria-label="Next cameras" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></button>
              </div>}
            </div>
          </section>
          <aside className="incident-panel" aria-label="Incident queue">
            <div className="console-panel-heading"><span>INCIDENT QUEUE</span><span className={incidents.length ? "text-red-400" : "text-slate-500"}>{incidents.length}</span></div>
            <AlertQueue alerts={incidents} onAcknowledge={handleAcknowledge} onOpenReview={setSelectedIncident} />
          </aside>
        </div>
      </main>

      {/* Review Modal */}
      <IncidentReviewModal
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onSubmitReview={handleSubmitReview}
      />

      {/* Camera Add/Edit Modal */}
      <CameraModal
        isOpen={cameraModalOpen}
        onClose={() => {
          setCameraModalOpen(false);
          setEditingCamera(null);
        }}
        cameraToEdit={editingCamera}
        initialMode={modalInitialMode}
        onSave={handleSaveCamera}
      />
    </div>
  );
}
