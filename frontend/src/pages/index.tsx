import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Header } from "../components/Header";
import { CameraWall } from "../components/CameraWall";
import { AlertQueue } from "../components/AlertQueue";
import { IncidentReviewModal } from "../components/IncidentReviewModal";
import { CameraModal } from "../components/CameraModal";
import { Camera, Incident } from "../types";
import { playAlertChime } from "../utils/audio";
import { useAuth } from "../context/AuthContext";

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
    <>
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

      <main id="main-content" tabIndex={-1} className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow mb-2">Monitoring workspace</p><h1 className="page-title">Live overview</h1><p className="page-description">Monitor your cameras and respond to incidents in one place.</p></div>
          <div className="flex gap-6 rounded-xl border border-sentinel-border bg-sentinel-card px-5 py-3">
            <div><p className="text-[11px] text-slate-400">Registered cameras</p><p className="text-2xl font-semibold tabular-nums mt-1">{cameras.length}</p></div>
            <div className="border-l border-sentinel-border pl-6"><p className="text-[11px] text-slate-400">Awaiting review</p><p className={"text-2xl font-semibold tabular-nums mt-1 " + (incidents.length ? "text-red-400" : "text-slate-200")}>{incidents.length}</p></div>
          </div>
        </div>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* CCTV Camera Wall */}
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">
              Camera feeds
            </h2>
            <span className="text-[11px] text-gray-500 font-mono">
              Live & simulated sources
            </span>
          </div>
          <CameraWall
            cameras={cameras}
            activeAlertCameraIds={activeAlertCameraIds}
            yoloLabelsEnabled={yoloLabelsEnabled}
            onEditCamera={(cam) => {
              setEditingCamera(cam);
              setModalInitialMode(cam.is_simulation ? "library" : "rtsp");
              setCameraModalOpen(true);
            }}
            onDeleteCamera={handleDeleteCamera}
          />
        </section>

        {/* Active Alerts Queue */}
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">
              Incident queue
            </h2>
          </div>
          <AlertQueue
            alerts={incidents}
            onAcknowledge={handleAcknowledge}
            onOpenReview={(inc) => setSelectedIncident(inc)}
          />
        </section>
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
    </>
  );
}
