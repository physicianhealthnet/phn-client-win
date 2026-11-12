/**
 * Utility for persisting and managing AI Scribe history per patient,
 * and converting scribe clinical notes into Treatment Tracker drafts.
 */

const STORAGE_PREFIX = "phn_scribe_history_";

/**
 * Default sample records for demo patients if no history exists yet
 */
const DEFAULT_DEMO_SCRIBE = {
  "PAT-TN-2026-0001": [
    {
      id: "SCR-DEMO-001",
      patientId: "PAT-TN-2026-0001",
      encounterId: "ENC-20261110-001",
      createdAt: "2026-11-10T10:15:00.000Z",
      language: "en-US",
      transcript:
        "Doctor: Good morning Ramesh. How is your lower back pain today? Patient: It is still stiff in the morning doctor, especially when getting out of bed. Doctor: Alright, we will continue lumbar stabilization exercises, apply hot fermentation twice daily, and adjust the dosage of your muscle relaxant.",
      translatedText: "",
      scribeData: {
        success: true,
        data: {
          chiefComplaint: "Lower back stiffness and persistent lumbar pain",
          assessment: "Subacute lumbar strain with morning stiffness",
          plan: "Continue lumbar stabilization protocol, heat therapy twice daily, adjust muscle relaxant for 5 days.",
          symptoms: ["Lumbar stiffness", "Difficulty rising from bed", "Mild localized pain"],
        },
      },
    },
  ],
};

/**
 * Retrieve scribe history for a specific patient
 */
export const getPatientScribeHistory = (patientId) => {
  if (!patientId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${patientId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // Return sample demo data if available for this demo patient
    if (DEFAULT_DEMO_SCRIBE[patientId]) {
      return DEFAULT_DEMO_SCRIBE[patientId];
    }
  } catch (err) {
    console.error("Error reading scribe history:", err);
  }
  return [];
};

/**
 * Save a new scribe record for a patient
 */
export const savePatientScribeHistory = (patientId, record) => {
  if (!patientId || !record) return [];
  try {
    const existing = getPatientScribeHistory(patientId);
    const newEntry = {
      id: record.id || `SCR-${Date.now()}`,
      patientId,
      patientName: record.patientName || "",
      encounterId:
        record.encounterId ||
        `ENC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`,
      createdAt: record.createdAt || new Date().toISOString(),
      language: record.language || "en-US",
      transcript: record.transcript || "",
      translatedText: record.translatedText || "",
      scribeData: record.scribeData || null,
    };

    const updated = [newEntry, ...existing.filter((item) => item.id !== newEntry.id)];
    localStorage.setItem(`${STORAGE_PREFIX}${patientId}`, JSON.stringify(updated));

    // Dispatch update event so any open components refresh immediately
    window.dispatchEvent(
      new CustomEvent("phn_scribe_history_updated", { detail: { patientId, record: newEntry } })
    );

    return updated;
  } catch (err) {
    console.error("Error saving scribe history:", err);
    return [];
  }
};

/**
 * Convert a scribe session into formatted fields for the Assessment Sheet (PhysicianAssessmentSheet)
 */
export const convertScribeToAssessmentDraft = (scribeRecord) => {
  if (!scribeRecord) return null;

  const data = scribeRecord.scribeData?.data || {};
  const chiefComplaint = data.chiefComplaint || "";
  const assessment = data.assessment || "";
  const plan = data.plan || "";
  const symptoms = Array.isArray(data.symptoms)
    ? data.symptoms.join(", ")
    : (data.symptoms || "");
  const hpi = data.historyOfPresentIllness || "";
  const mainTranscript = scribeRecord.translatedText || scribeRecord.transcript || "";

  return {
    patientId: scribeRecord.patientId,
    encounterId: scribeRecord.encounterId || "ENC-Consultation",
    chiefComplaint: chiefComplaint || (mainTranscript ? mainTranscript.slice(0, 100) : "Voice Consultation"),
    hpi: hpi || mainTranscript,
    diagnosis: assessment || "Clinical Evaluation (AI Scribe)",
    assessment: assessment || "Clinical Evaluation (AI Scribe)",
    plan: plan || "Continue standard supportive care and advised follow-up.",
    symptoms: symptoms,
    transcript: mainTranscript,
    createdAt: scribeRecord.createdAt,
  };
};

/**
 * Store drafted assessment data in sessionStorage for smooth navigation
 */
export const stageScribeDraftForAssessment = (patientId, scribeRecord) => {
  const draft = convertScribeToAssessmentDraft(scribeRecord);
  if (draft && patientId) {
    sessionStorage.setItem(`phn_scribe_assessment_draft_${patientId}`, JSON.stringify(draft));
  }
  return draft;
};

/**
 * Convert a scribe session into formatted fields for the Treatment Tracker
 */
export const convertScribeToTreatmentDraft = (scribeRecord) => {
  if (!scribeRecord) return null;

  const data = scribeRecord.scribeData?.data || {};
  const chiefComplaint = data.chiefComplaint || "";
  const assessment = data.assessment || "";
  const plan = data.plan || "";
  const symptoms = Array.isArray(data.symptoms) ? data.symptoms.join(", ") : "";

  // Structured clinical note
  const noteParts = [];
  noteParts.push(`[AI Scribe Note - Encounter: ${scribeRecord.encounterId || "General"}]`);
  if (chiefComplaint) noteParts.push(`Chief Complaint: ${chiefComplaint}`);
  if (symptoms) noteParts.push(`Symptoms: ${symptoms}`);
  if (assessment) noteParts.push(`Clinical Assessment: ${assessment}`);
  if (plan) noteParts.push(`Recommended Plan: ${plan}`);

  const mainTranscript = scribeRecord.translatedText || scribeRecord.transcript;
  if (mainTranscript) {
    noteParts.push(`\nVoice Transcript:\n"${mainTranscript}"`);
    if (scribeRecord.translatedText && scribeRecord.transcript) {
      noteParts.push(`(Original Tamil: "${scribeRecord.transcript}")`);
    }
  }

  const formattedNotes = noteParts.join("\n");
  const protocol = assessment || chiefComplaint || "General Consultation Review";
  const homeAdvice = plan || "Follow prescribed exercise and care instructions.";

  return {
    patientId: scribeRecord.patientId,
    encounterId: scribeRecord.encounterId,
    notes: formattedNotes,
    protocol,
    homeAdvice,
    transcript: mainTranscript,
    createdAt: scribeRecord.createdAt,
  };
};

/**
 * Store drafted treatment data in sessionStorage for smooth navigation
 */
export const stageScribeDraftForTreatment = (patientId, scribeRecord) => {
  const draft = convertScribeToTreatmentDraft(scribeRecord);
  if (draft && patientId) {
    sessionStorage.setItem(`phn_scribe_draft_${patientId}`, JSON.stringify(draft));
  }
  return draft;
};

