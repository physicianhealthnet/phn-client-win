import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Select, Button as AntButton, message, Spin, Input, Tag } from "antd";
import { Icon } from "@iconify/react";
import Button from "../../../component/ui/Button";
import Card from "../../../component/ui/Card";
import { AxiosInstance, AxiosInstanceSecondryServer } from "../../../utilities/AxiosInstance";
import {
  savePatientScribeHistory,
  stageScribeDraftForAssessment,
} from "../../../utilities/scribeStorage";
import PatientScribeHistory from "../../../component/scribe/PatientScribeHistory";

const { TextArea } = Input;
const { Option } = Select;

const AiScribePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [language, setLanguage] = useState("en-US");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestSavedRecord, setLatestSavedRecord] = useState(null);

  // Patient selection states
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(false);
  
  const recognitionRef = useRef(null);
  const baseTranscriptRef = useRef("");
  const latestTranscriptRef = useRef("");

  // Fetch patients list for user selection
  const fetchPatients = async () => {
    setLoadingPatients(true);
    try {
      const userInfo = JSON.parse(
        sessionStorage.getItem("user") || sessionStorage.getItem("master") || "{}"
      );
      const clinicId = userInfo?.cid || userInfo?.clinicId || "C-1";

      let list = [];
      try {
        const res = await AxiosInstance.get(`/patient/get-all-by-clinic/${clinicId}`);
        if (res.data?.patients && res.data.patients.length > 0) {
          list = res.data.patients;
        } else if (res.data?.data && res.data.data.length > 0) {
          list = res.data.data;
        } else if (Array.isArray(res.data) && res.data.length > 0) {
          list = res.data;
        }
      } catch (err) {
        console.warn("Could not fetch patients from primary clinic endpoint, checking secondary server...", err);
      }

      if (!list || list.length === 0) {
        try {
          const res2 = await AxiosInstanceSecondryServer.post("/patientregistration/list", {
            clinicId,
            search: "",
          });
          if (res2.data?.patients) {
            list = res2.data.patients;
          }
        } catch (err2) {
          console.warn("Secondary server fetch failed:", err2);
        }
      }

      // Format patient records for selection and UI reference
      const formatted = (list || []).map((p) => {
        const pb = p.patientBasic || p;
        const name = (
          `${pb.firstName || ""} ${pb.lastName || ""}`.trim() ||
          p.patientName ||
          pb.patientName ||
          "Unknown Patient"
        );
        const id = pb.patientId || p.patientId || p._id || pb._id || "";
        const phone = pb.phone || pb.patientPhone || p.patientPhone || p.phone || "";
        const gender = pb.gender || pb.patientGender || p.patientGender || p.gender || "";
        const age = pb.age || pb.patientAge || p.patientAge || p.age || "";
        const phn = p.PHN_ID || pb.PHN_ID || "";
        const address = pb.address || p.location || p.patientAddress || "";

        return {
          ...p,
          patientId: id,
          patientName: name,
          patientPhone: phone,
          patientGender: gender,
          patientAge: age,
          PHN_ID: phn,
          address: address,
        };
      });

      setPatients(formatted);

      // Check for incoming patientId from navigation state or URL query
      const searchParams = new URLSearchParams(location.search);
      const targetId = location.state?.patientId || location.state?.patient?.patientId || searchParams.get("patientId");

      if (targetId) {
        const targetPatient = formatted.find(
          (p) => String(p.patientId) === String(targetId) || String(p._id) === String(targetId)
        );
        if (targetPatient) {
          setPatientId(targetPatient.patientId);
          setSelectedPatient(targetPatient);
        } else {
          setPatientId(targetId);
        }
      }
    } catch (error) {
      console.error("Failed to load patients:", error);
      message.error("Failed to load patients list.");
    } finally {
      setLoadingPatients(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const handlePatientSelect = (value) => {
    setPatientId(value || "");
    if (!value) {
      setSelectedPatient(null);
      return;
    }
    const matched = patients.find((p) => p.patientId === value);
    setSelectedPatient(matched || null);
  };

  useEffect(() => {
    latestTranscriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => console.log("[SpeechRecognition] onstart - Microphone is active");
      recognition.onaudiostart = () => console.log("[SpeechRecognition] onaudiostart - Audio capturing started");
      recognition.onsoundstart = () => console.log("[SpeechRecognition] onsoundstart - Sound detected");
      recognition.onspeechstart = () => console.log("[SpeechRecognition] onspeechstart - Speech detected");
      
      recognition.onresult = (event) => {
        console.log("[SpeechRecognition] onresult - Data received", event.results);
        let currentSessionTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          currentSessionTranscript += event.results[i][0].transcript;
        }
        let prefix = baseTranscriptRef.current;
        if (prefix && !prefix.endsWith(" ") && currentSessionTranscript && !currentSessionTranscript.startsWith(" ")) {
            prefix += " ";
        }
        setTranscript(prefix + currentSessionTranscript);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== "no-speech") {
          message.error("Speech recognition error: " + event.error);
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        console.log("[SpeechRecognition] onend - Recording session ended");
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } else {
      message.error("Speech Recognition API is not supported in this browser.");
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      if (recognitionRef.current) {
        baseTranscriptRef.current = latestTranscriptRef.current;
        recognitionRef.current.lang = language;
        recognitionRef.current.start();
        setIsRecording(true);
        setTranslatedText("");
      }
    }
  };

  const handleTranslate = async () => {
    if (!transcript.trim()) return;
    setIsTranslating(true);
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(transcript)}&langpair=ta|en`);
      const data = await res.json();
      if (data && data.responseData && data.responseData.translatedText) {
        setTranslatedText(data.responseData.translatedText);
      } else {
        throw new Error("Translation failed");
      }
    } catch (error) {
      console.error(error);
      message.error("Failed to translate the text.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleDriftToTreatment = (customRecord) => {
    const finalTranscript = language === "ta-IN" ? (translatedText || transcript) : transcript;
    const targetRecord = customRecord || latestSavedRecord || {
      id: "SCR-" + Date.now(),
      patientId,
      patientName: selectedPatient?.patientName,
      encounterId: "ENC-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-001",
      transcript: finalTranscript,
      translatedText,
      language,
      createdAt: new Date().toISOString(),
    };

    if (!targetRecord.transcript && !targetRecord.translatedText) {
      message.warning("Please record or enter a transcript first.");
      return;
    }

    if (!patientId) {
      message.warning("Please select a patient first.");
      return;
    }

    // Ensure it is saved into patient directory history
    savePatientScribeHistory(patientId, targetRecord);

    // Stage draft data for Assessment
    const draft = stageScribeDraftForAssessment(patientId, targetRecord);

    message.success("Sharing scribe data to Assessment...");
    navigate(`/patient-details/${patientId}`, {
      state: {
        openSection: "1",
        scribeDraft: draft,
      },
    });
  };

  const handleSubmit = async () => {
    const finalTranscript = language === "ta-IN" ? translatedText : transcript;
    
    if (!finalTranscript.trim()) {
      message.warning("Transcript is empty. Please record or enter some text.");
      return;
    }
    
    if (language === "ta-IN" && !translatedText.trim()) {
      message.warning("Please translate the Tamil transcript to English before submitting.");
      return;
    }

    if (!patientId || !patientId.trim()) {
      message.warning("Please select a patient before submitting.");
      return;
    }

    const encounterId = "ENC-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-001";
    setIsSubmitting(true);
    try {
      let scribeData = null;
      try {
        const response = await fetch("https://physicianhealthnet.com/api/scribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "bd4037edf73e2270c9f59f1a9513952d6f023d7a12e741e4046a304dd2e93fc2",
          },
          body: JSON.stringify({
            patientId: patientId,
            encounterId: encounterId,
            transcript: finalTranscript,
          }),
        });

        if (response.ok) {
          scribeData = await response.json().catch(() => null);
        }
      } catch (apiErr) {
        console.warn("External Scribe API fetch error:", apiErr);
      }

      // Save into patient's scribe history in the patient directory
      const newRecord = {
        id: "SCR-" + Date.now(),
        patientId,
        patientName: selectedPatient?.patientName,
        encounterId,
        transcript: finalTranscript,
        translatedText,
        language,
        createdAt: new Date().toISOString(),
        scribeData,
      };

      savePatientScribeHistory(patientId, newRecord);
      setLatestSavedRecord(newRecord);

      message.success("Transcript sent to AI Scribe & stored in patient history!");
    } catch (error) {
      console.error("API error:", error);
      message.error("Failed to send transcript to AI Scribe.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card className="max-w-3xl mx-auto my-6 p-6">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
        <Icon icon="solar:microphone-3-bold-duotone" className="text-blue-500 text-3xl" />
        <h1 className="text-2xl font-bold text-slate-800 m-0">AI Scribe</h1>
      </div>

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">
                Select Patient <span className="text-red-500">*</span>
              </label>
              {loadingPatients && (
                <span className="text-xs text-blue-500 flex items-center gap-1">
                  <Spin size="small" /> Loading...
                </span>
              )}
            </div>
            <Select
              showSearch
              placeholder="Search by name, ID, or phone..."
              value={patientId || undefined}
              onChange={handlePatientSelect}
              loading={loadingPatients}
              disabled={isRecording || isSubmitting}
              className="w-full"
              allowClear
              filterOption={(input, option) => {
                const searchStr = `${option?.label || ""} ${option?.patient?.patientName || ""} ${option?.patient?.patientId || ""} ${option?.patient?.patientPhone || ""} ${option?.patient?.PHN_ID || ""}`.toLowerCase();
                return searchStr.includes(input.toLowerCase());
              }}
              notFoundContent={
                loadingPatients ? (
                  <div className="p-3 text-center text-xs text-slate-400">Loading patients...</div>
                ) : (
                  <div className="p-3 text-center text-xs text-slate-400">No patients found</div>
                )
              }
            >
              {patients.map((p) => (
                <Option
                  key={p.patientId}
                  value={p.patientId}
                  label={`${p.patientName} (${p.patientId})`}
                  patient={p}
                >
                  <div className="flex items-center justify-between py-1">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800 text-sm">{p.patientName}</span>
                      <span className="text-xs text-slate-400">
                        ID: {p.patientId} {p.PHN_ID ? `• PHN: ${p.PHN_ID}` : ""}
                      </span>
                    </div>
                    <div className="text-right">
                      {p.patientPhone && (
                        <span className="text-xs text-slate-600 font-medium block">
                          📞 {p.patientPhone}
                        </span>
                      )}
                      {(p.patientAge || p.patientGender) && (
                        <span className="text-[11px] text-slate-400">
                          {[p.patientAge ? `${p.patientAge}y` : "", p.patientGender].filter(Boolean).join(" • ")}
                        </span>
                      )}
                    </div>
                  </div>
                </Option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Select Spoken Language <span className="text-red-500">*</span>
            </label>
            <Select
              value={language}
              onChange={(val) => setLanguage(val)}
              className="w-full"
              disabled={isRecording}
            >
              <Option value="en-US">English</Option>
              <Option value="ta-IN">Tamil (தமிழ்)</Option>
            </Select>
          </div>
        </div>

        {/* Selected Patient Reference Card */}
        {selectedPatient ? (
          <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border border-blue-200/80 rounded-xl p-4 shadow-sm transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                  {selectedPatient.patientName?.charAt(0).toUpperCase() || "P"}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800 m-0">
                      {selectedPatient.patientName}
                    </h3>
                    <Tag color="blue" className="font-semibold text-xs m-0">
                      ID: {selectedPatient.patientId}
                    </Tag>
                    {selectedPatient.PHN_ID && (
                      <Tag className="text-xs m-0 bg-white text-slate-600 border-slate-300">
                        PHN: {selectedPatient.PHN_ID}
                      </Tag>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                    {selectedPatient.patientPhone && (
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        <Icon icon="solar:phone-calling-bold-duotone" className="text-blue-500 text-sm" />
                        {selectedPatient.patientPhone}
                      </span>
                    )}
                    {(selectedPatient.patientAge || selectedPatient.patientGender) && (
                      <span className="flex items-center gap-1">
                        <Icon icon="solar:user-bold-duotone" className="text-blue-500 text-sm" />
                        {[selectedPatient.patientAge ? `${selectedPatient.patientAge} yrs` : null, selectedPatient.patientGender].filter(Boolean).join(" • ")}
                      </span>
                    )}
                    {selectedPatient.address && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Icon icon="solar:map-point-bold-duotone" className="text-blue-500 text-sm" />
                        <span className="truncate max-w-sm">{selectedPatient.address}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <AntButton
                type="text"
                size="small"
                onClick={() => {
                  setPatientId("");
                  setSelectedPatient(null);
                }}
                disabled={isRecording || isSubmitting}
                className="text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center gap-1 px-2 h-7 rounded"
              >
                <Icon icon="solar:close-circle-linear" className="text-base" />
                <span className="text-xs">Clear</span>
              </AntButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-800">
            <Icon icon="solar:info-circle-bold-duotone" className="text-base text-amber-600 shrink-0" />
            <span>Select a patient above to link and reference patient records for this transcription encounter.</span>
          </div>
        )}

        <div className="flex justify-center my-6">
          <button
            onClick={toggleRecording}
            className={`flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 shadow-md ${
              isRecording 
                ? "bg-red-100 text-red-500 animate-pulse border-4 border-red-500" 
                : "bg-blue-100 text-blue-500 hover:bg-blue-200"
            }`}
          >
            <Icon icon={isRecording ? "solar:stop-circle-bold" : "solar:microphone-3-bold"} className="text-4xl" />
          </button>
        </div>
        
        {isRecording && (
          <p className="text-center text-sm text-red-500 font-medium">Recording in progress...</p>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Transcript</label>
          <TextArea
            rows={5}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Live transcript will appear here as you speak..."
            className="w-full text-base"
          />
        </div>

        {language === "ta-IN" && (
          <div className="mt-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">English Translation</label>
              <AntButton size="small" type="primary" ghost onClick={handleTranslate} loading={isTranslating} disabled={!transcript || isRecording}>
                Translate Now
              </AntButton>
            </div>
            <TextArea
              rows={5}
              value={translatedText}
              onChange={(e) => setTranslatedText(e.target.value)}
              placeholder="Translated English text will appear here..."
              className="w-full text-base"
            />
          </div>
        )}

        {latestSavedRecord && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shadow-sm">
                <Icon icon="solar:check-circle-bold" className="text-2xl" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-900 m-0">Scribe Session Saved to Patient Directory!</h4>
                <p className="text-xs text-emerald-700 m-0">
                  Encounter {latestSavedRecord.encounterId} stored in medical history for {selectedPatient?.patientName}.
                </p>
              </div>
            </div>
            <AntButton
              type="primary"
              onClick={() => handleDriftToTreatment(latestSavedRecord)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Icon icon="solar:document-text-bold-duotone" className="text-base" />
              <span>Share to Assessment</span>
            </AntButton>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            {selectedPatient && (
              <span>Linked Patient: <strong className="text-slate-800">{selectedPatient.patientName}</strong> ({selectedPatient.patientId})</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => handleDriftToTreatment()}
              disabled={isRecording || (!transcript && !translatedText && !latestSavedRecord)}
              className="flex items-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              <Icon icon="solar:document-text-bold-duotone" className="text-lg text-indigo-600" />
              <span>Share to Assessment</span>
            </Button>

            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={isRecording || (!transcript && !translatedText) || isSubmitting}
              className="flex items-center gap-2 px-6"
            >
              {isSubmitting ? <Spin size="small" /> : <Icon icon="solar:plain-2-linear" />}
              <span>Submit to AI Scribe</span>
            </Button>
          </div>
        </div>
      </div>
    </Card>

    {/* Patient Directory Scribe History View */}
    {selectedPatient && (
      <Card className="max-w-3xl mx-auto my-6 p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-800 m-0 flex items-center gap-2">
            <Icon icon="solar:history-bold-duotone" className="text-blue-500 text-xl" />
            <span>Patient Scribe History ({selectedPatient.patientName})</span>
          </h3>
          <p className="text-xs text-slate-500 m-0 mt-0.5">
            Recorded voice history saved in patient directory. Click &quot;Share to Assessment&quot; to transfer any record.
          </p>
        </div>

        <PatientScribeHistory
          patientId={patientId}
          onDraftToTreatment={(draft) => {
            navigate(`/patient-details/${patientId}`, {
              state: {
                openSection: "1",
                scribeDraft: draft,
              },
            });
          }}
        />
      </Card>
    )}
  </>
  );
};

export default AiScribePage;
