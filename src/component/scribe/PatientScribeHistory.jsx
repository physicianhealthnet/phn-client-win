import React, { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Tag, Button as AntButton, message, Collapse, Empty } from "antd";
import { useNavigate } from "react-router-dom";
import {
  getPatientScribeHistory,
  stageScribeDraftForAssessment,
} from "../../utilities/scribeStorage";

const PatientScribeHistory = ({ patientId, onDraftToTreatment }) => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [expandedTranscripts, setExpandedTranscripts] = useState({});

  const loadHistory = () => {
    if (!patientId) {
      setHistory([]);
      return;
    }
    const records = getPatientScribeHistory(patientId);
    setHistory(records);
  };

  useEffect(() => {
    loadHistory();

    const handleUpdate = (e) => {
      if (!e.detail?.patientId || e.detail.patientId === patientId) {
        loadHistory();
      }
    };

    window.addEventListener("phn_scribe_history_updated", handleUpdate);
    return () => {
      window.removeEventListener("phn_scribe_history_updated", handleUpdate);
    };
  }, [patientId]);

  const toggleExpandTranscript = (id) => {
    setExpandedTranscripts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleDraftClick = (record) => {
    const draft = stageScribeDraftForAssessment(patientId, record);

    if (onDraftToTreatment) {
      onDraftToTreatment(draft);
    } else {
      message.success("Sharing scribe data to Assessment...");
      navigate(`/patient-details/${patientId}`, {
        state: {
          openSection: "1",
          scribeDraft: draft,
        },
      });
    }
  };

  if (!patientId) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">
        Please select a patient to view their AI Scribe history.
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
        <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-3">
          <Icon icon="solar:microphone-3-bold-duotone" className="text-2xl" />
        </div>
        <h4 className="font-bold text-slate-700 text-base mb-1">No AI Scribe History</h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
          There are no recorded voice scribe sessions for this patient yet. Use the AI Scribe tool to dictate and automatically generate clinical encounter notes.
        </p>
        <AntButton
          type="primary"
          onClick={() => navigate(`/ai-scribe?patientId=${patientId}`)}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700"
        >
          <Icon icon="solar:microphone-3-bold" className="text-base" />
          <span>Start AI Scribe Session</span>
        </AntButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Icon icon="solar:history-bold-duotone" className="text-blue-600 text-xl" />
          <h4 className="font-bold text-slate-800 text-sm m-0">
            Recorded Scribe Sessions ({history.length})
          </h4>
        </div>
        <AntButton
          size="small"
          onClick={() => navigate(`/ai-scribe?patientId=${patientId}`)}
          className="text-xs flex items-center gap-1 text-blue-600 border-blue-200 hover:border-blue-500"
        >
          <Icon icon="solar:add-circle-bold" className="text-sm" />
          <span>New Session</span>
        </AntButton>
      </div>

      <div className="space-y-3">
        {history.map((record) => {
          const isExpanded = !!expandedTranscripts[record.id];
          const data = record.scribeData?.data;
          const formattedDate = record.createdAt
            ? new Date(record.createdAt).toLocaleString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Recent";

          return (
            <div
              key={record.id}
              className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:border-blue-300 transition-all"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800 text-sm">
                    {record.encounterId || "Voice Encounter"}
                  </span>
                  <Tag color="blue" className="text-xs font-semibold m-0">
                    {formattedDate}
                  </Tag>
                  <Tag className="text-xs m-0 bg-slate-100 text-slate-600 border-slate-200">
                    {record.language === "ta-IN" ? "Tamil / English" : "English"}
                  </Tag>
                </div>

                {/* The SHARE TO ASSESSMENT Button */}
                <AntButton
                  type="primary"
                  size="middle"
                  onClick={() => handleDraftClick(record)}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm rounded-lg"
                >
                  <Icon icon="solar:document-text-bold-duotone" className="text-base" />
                  <span>Share to Assessment</span>
                </AntButton>
              </div>

              {/* AI Clinical Summary (if available) */}
              {data && (
                <div className="mb-3 p-3.5 bg-gradient-to-r from-blue-50/50 to-indigo-50/40 border border-blue-100 rounded-xl space-y-2 text-xs">
                  {data.chiefComplaint && (
                    <div>
                      <span className="font-bold text-slate-700">Chief Complaint: </span>
                      <span className="text-slate-800 font-medium">{data.chiefComplaint}</span>
                    </div>
                  )}
                  {data.assessment && (
                    <div>
                      <span className="font-bold text-slate-700">Assessment: </span>
                      <span className="text-slate-800 font-medium">{data.assessment}</span>
                    </div>
                  )}
                  {data.plan && (
                    <div>
                      <span className="font-bold text-slate-700">Plan: </span>
                      <span className="text-slate-800 font-medium">{data.plan}</span>
                    </div>
                  )}
                  {Array.isArray(data.symptoms) && data.symptoms.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="font-bold text-slate-700 mr-1">Symptoms:</span>
                      {data.symptoms.map((s, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-white text-indigo-700 border border-indigo-200 rounded-md font-medium text-[11px]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Transcript Details */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <Icon icon="solar:chat-round-line-bold" className="text-blue-500" />
                    Transcript
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExpandTranscript(record.id)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    {isExpanded ? "Collapse" : "Show Full"}
                  </button>
                </div>

                <div
                  className={`text-xs text-slate-700 whitespace-pre-wrap font-sans transition-all ${
                    isExpanded ? "" : "line-clamp-2"
                  }`}
                >
                  {record.translatedText ? (
                    <div>
                      <p className="font-medium text-slate-800 m-0 mb-1">
                        {record.translatedText}
                      </p>
                      {isExpanded && record.transcript && (
                        <p className="text-slate-500 italic m-0 pt-1 border-t border-slate-200">
                          Original: {record.transcript}
                        </p>
                      )}
                    </div>
                  ) : (
                    record.transcript || "No transcript recorded"
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PatientScribeHistory;

