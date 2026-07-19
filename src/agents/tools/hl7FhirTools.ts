/**
 * HL7 v2 & FHIR R4 Healthcare Standards Tools
 *
 * Provides agent tools for parsing/building HL7 v2 messages and
 * searching/creating/validating FHIR R4 resources.
 *
 * Target agent: healthcare_intake
 */

import { registry } from "../tools";
import type { ToolContext, ToolResult } from "../schema";

// ── HL7 v2 Message Types ─────────────────────────────────────────────────

interface HL7Segment {
  name: string;
  fields: string[];
}

interface HL7Message {
  messageType: string;
  eventType: string;
  segments: HL7Segment[];
  raw: string;
}

// ── FHIR R4 Resource Types ───────────────────────────────────────────────

interface FHIRResource {
  resourceType: string;
  id?: string;
  [key: string]: any;
}

// ── HL7 Parser (v2.x) ────────────────────────────────────────────────────

function parseHL7v2(raw: string): { success: boolean; data?: HL7Message; error?: string } {
  try {
    // Clean the message
    const cleaned = raw.replace(/\r\n?/g, "\r").replace(/\n/g, "\r").trim();
    const segmentStrings = cleaned.split("\r").filter((s) => s.trim().length > 0);

    if (segmentStrings.length === 0) {
      return { success: false, error: "Empty HL7 message" };
    }

    const segments: HL7Segment[] = [];

    for (const segStr of segmentStrings) {
      const fields = segStr.split("|");
      const segmentName = fields[0];
      segments.push({
        name: segmentName,
        fields: fields.slice(1),
      });
    }

    // Determine message type from MSH segment
    let messageType = "UNKNOWN";
    let eventType = "";

    if (segments.length > 0 && segments[0].fields[0]?.startsWith("MSH")) {
      const mshFields = segments[0].split("|");
      if (mshFields.length >= 9) {
        const msgTypeField = mshFields[8]; // MSH-9
        const parts = msgTypeField.split("^");
        messageType = parts[0] || "UNKNOWN";
        eventType = parts[1] || "";
      }
    } else if (segments[0].startsWith("MSH")) {
      const mshFields = segments[0].split("|");
      if (mshFields.length >= 9) {
        const msgTypeField = mshFields[8];
        const parts = msgTypeField.split("^");
        messageType = parts[0] || "UNKNOWN";
        eventType = parts[1] || "";
      }
    }

    // Extract patient info from PID segment
    let patientInfo: Record<string, string> = {};
    for (const seg of segments) {
      if (seg.name === "PID") {
        patientInfo = {
          patientId: seg.fields[2] || "",
          patientName: seg.fields[4] || "",
          dateOfBirth: seg.fields[6] || "",
          sex: seg.fields[7] || "",
          address: seg.fields[10] || "",
          phone: seg.fields[12] || "",
        };
      }
    }

    return {
      success: true,
      data: {
        messageType,
        eventType,
        segments,
        raw: cleaned,
      },
    };
  } catch (err: any) {
    return { success: false, error: `HL7 parse error: ${err.message}` };
  }
}

// ── HL7 Builder ──────────────────────────────────────────────────────────

function buildHL7v2(params: {
  messageType: string;
  eventType?: string;
  sendingApp?: string;
  sendingFacility?: string;
  receivingApp?: string;
  receivingFacility?: string;
  patientData?: Record<string, string>;
  customSegments?: string[];
}): string {
  const now = new Date();
  const dateTime = now.toISOString().replace(/[-:]/g, "").slice(0, 14);

  // MSH segment
  const mshFields: string[] = [
    "MSH",
    "^~\\&",                                                                  // MSH-2: encoding chars
    params.sendingApp || "SIMPLERLIFE100",                                    // MSH-3: sending application
    params.sendingFacility || "SIMPLERLIFE100",                               // MSH-4: sending facility
    params.receivingApp || "EXTERNAL",                                         // MSH-5: receiving application
    params.receivingFacility || "EXTERNAL",                                    // MSH-6: receiving facility
    dateTime,                                                                  // MSH-7: date/time
    "",                                                                        // MSH-8: security
    `${params.messageType}^${params.eventType || ""}`,                         // MSH-9: message type
    "P",                                                                       // MSH-11: processing ID (Production)
    "2.5",                                                                     // MSH-12: version ID
  ];

  const lines: string[] = [mshFields.join("|")];

  // EVN segment (event type)
  if (params.eventType) {
    lines.push(`EVN|${params.eventType}||${dateTime}`);
  }

  // PID segment (patient identification)
  if (params.patientData) {
    const pidFields: string[] = [
      "PID",
      "1",                                                                     // PID-1: set ID
      params.patientData.patientId || "",                                       // PID-2: patient ID (external)
      "",                                                                       // PID-3: patient ID (internal)
      params.patientData.patientName || "",                                     // PID-5: patient name
      "",                                                                       // PID-6: mother's maiden name
      params.patientData.dateOfBirth || "",                                     // PID-7: date of birth
      params.patientData.sex || "",                                             // PID-8: sex
      "",                                                                       // PID-9: patient alias
      "",                                                                       // PID-10: race
      params.patientData.address || "",                                         // PID-11: address
      "",                                                                       // PID-12: county code
      params.patientData.phone || "",                                           // PID-13: phone number
    ];
    lines.push(pidFields.join("|"));
  }

  // Custom segments
  if (params.customSegments) {
    lines.push(...params.customSegments);
  }

  return lines.join("\r");
}

// ── FHIR Resource Constructors ────────────────────────────────────────────

function buildFHIRPatient(data: Record<string, any>): FHIRResource {
  const names = [];
  if (data.givenName || data.familyName) {
    const name: any = { use: "official" };
    if (data.familyName) name.family = data.familyName;
    if (data.givenName) {
      name.given = data.givenName.split(" ").filter(Boolean);
      if (name.given.length === 0) name.given = [data.givenName];
    }
    names.push(name);
  }

  const identifiers = [];
  if (data.patientId) {
    identifiers.push({
      use: "usual",
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR" }] },
      value: data.patientId,
    });
  }
  if (data.ssn) {
    identifiers.push({
      use: "official",
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "SS" }] },
      value: data.ssn,
    });
  }

  const resource: FHIRResource = {
    resourceType: "Patient",
    identifier: identifiers.length > 0 ? identifiers : undefined,
    name: names.length > 0 ? names : undefined,
    gender: data.sex?.toLowerCase() === "f" ? "female" : data.sex?.toLowerCase() === "m" ? "male" : data.sex,
    birthDate: data.dateOfBirth,
    address: data.address
      ? [{ line: [data.address], city: data.city, state: data.state, postalCode: data.zip, country: data.country }]
      : undefined,
    telecom: data.phone
      ? [{ system: "phone", value: data.phone, use: "home" }]
      : undefined,
    maritalStatus: data.maritalStatus
      ? { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus", code: data.maritalStatus }] }
      : undefined,
  };

  // Remove undefined fields
  Object.keys(resource).forEach((k) => {
    if (resource[k] === undefined) delete resource[k];
  });

  return resource;
}

function buildFHIRObservation(data: Record<string, any>): FHIRResource {
  const resource: FHIRResource = {
    resourceType: "Observation",
    status: data.status || "final",
    code: {
      coding: [
        {
          system: data.codeSystem || "http://loinc.org",
          code: data.code || "unknown",
          display: data.display || "",
        },
      ],
      text: data.display || "",
    },
    subject: data.subjectReference ? { reference: data.subjectReference } : undefined,
    effectiveDateTime: data.effectiveDateTime || new Date().toISOString(),
    valueQuantity: data.value && data.unit
      ? { value: data.value, unit: data.unit, system: "http://unitsofmeasure.org" }
      : undefined,
    valueString: data.valueString,
    interpretation: data.interpretation
      ? [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: data.interpretation }] }]
      : undefined,
    referenceRange: data.referenceRange
      ? [{ low: { value: data.referenceRange.low }, high: { value: data.referenceRange.high } }]
      : undefined,
  };

  Object.keys(resource).forEach((k) => {
    if (resource[k] === undefined) delete resource[k];
  });

  return resource;
}

function buildFHIREncounter(data: Record<string, any>): FHIRResource {
  const resource: FHIRResource = {
    resourceType: "Encounter",
    status: data.status || "in-progress",
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: data.classCode || "AMB",
      display: data.classDisplay || "ambulatory",
    },
    type: data.type
      ? [{ coding: [{ system: "http://snomed.info/sct", code: data.typeCode || "", display: data.type }] }]
      : undefined,
    subject: data.subjectReference ? { reference: data.subjectReference } : undefined,
    period: {
      start: data.startTime || new Date().toISOString(),
      end: data.endTime,
    },
    reasonCode: data.reason
      ? [{ coding: [{ system: "http://snomed.info/sct", code: data.reasonCode || "", display: data.reason }] }]
      : undefined,
    diagnosis: data.diagnosis
      ? [{ condition: { reference: data.diagnosis }, use: { coding: [{ code: "AD" }] } }]
      : undefined,
  };

  Object.keys(resource).forEach((k) => {
    if (resource[k] === undefined) delete resource[k];
  });

  return resource;
}

// ── FHIR Validator ───────────────────────────────────────────────────────

function validateFHIRResource(resource: FHIRResource): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!resource.resourceType) {
    errors.push("Missing required field: resourceType");
    return { valid: false, errors };
  }

  const validTypes = [
    "Patient", "Observation", "Encounter", "Condition", "MedicationRequest",
    "DiagnosticReport", "Procedure", "Immunization", "AllergyIntolerance",
    "Organization", "Practitioner", "CarePlan", "DocumentReference",
    "Appointment", "Claim", "Coverage", "Questionnaire", "QuestionnaireResponse",
  ];

  if (!validTypes.includes(resource.resourceType)) {
    errors.push(`Unknown resourceType: ${resource.resourceType}. Valid types: ${validTypes.join(", ")}`);
  }

  // Resource-specific validation
  if (resource.resourceType === "Patient") {
    if (!resource.name && !resource.identifier) {
      errors.push("Patient must have at least name or identifier");
    }
  }

  if (resource.resourceType === "Observation") {
    if (!resource.code) {
      errors.push("Observation must have a code");
    }
    if (!resource.status) {
      errors.push("Observation must have a status");
    }
  }

  if (resource.resourceType === "Encounter") {
    if (!resource.status) {
      errors.push("Encounter must have a status");
    }
    if (!resource.class) {
      errors.push("Encounter must have a class");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── FHIR Search Builder ──────────────────────────────────────────────────

function buildFHIRSearchQuery(
  resourceType: string,
  filters: Record<string, string>,
  options?: { sort?: string; limit?: number; offset?: number },
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    params.append(key, value);
  }

  if (options?.sort) params.append("_sort", options.sort);
  if (options?.limit) params.append("_count", String(options.limit));
  if (options?.offset) params.append("_offset", String(options.offset));

  const queryString = params.toString();
  return `${resourceType}${queryString ? `?${queryString}` : ""}`;
}

// ── Tool: hl7_parse ──────────────────────────────────────────────────────

registry.register({
  name: "hl7_parse",
  description: "Parse an HL7 v2.x message (ADT, ORM, ORU, etc.) and extract structured segments, fields, and patient information.",
  parameters: [
    { name: "message", type: "string", description: "Raw HL7 v2 message text (pipe-delimited, segments separated by carriage returns)", required: true },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const message = (params.message as string) || "";
    if (!message.trim()) {
      return { success: false, error: "HL7 message is required" };
    }

    const result = parseHL7v2(message);
    if (!result.success) {
      return { success: false, error: result.error || "Failed to parse HL7 message" };
    }

    return {
      success: true,
      data: {
        messageType: result.data!.messageType,
        eventType: result.data!.eventType,
        segmentCount: result.data!.segments.length,
        segments: result.data!.segments.map((s) => ({
          name: s.name,
          fieldCount: s.fields.length,
          preview: s.fields.slice(0, 5),
        })),
        patientInfo: extractPatientInfo(result.data!.segments),
        raw: result.data!.raw.slice(0, 2000),
      },
    };
  },
});

function extractPatientInfo(segments: HL7Segment[]): Record<string, string> {
  for (const seg of segments) {
    if (seg.name === "PID") {
      const f = seg.fields;
      return {
        patientId: f[2] || "",
        patientName: f[4] || "",
        dateOfBirth: f[6] || "",
        sex: f[7] || "",
        address: f[10] || "",
        phone: f[12] || "",
      };
    }
  }
  return {};
}

// ── Tool: hl7_build ──────────────────────────────────────────────────────

registry.register({
  name: "hl7_build",
  description: "Build (construct) an HL7 v2.x message from structured data. Supports ADT, ORM, ORU, and other message types with PID and custom segments.",
  parameters: [
    { name: "messageType", type: "string", description: "HL7 message type (e.g., ADT, ORM, ORU, DFT, MDM)", required: true },
    { name: "eventType", type: "string", description: "Event type (e.g., A01, O01, R01 for ADT^A01)", required: false },
    { name: "sendingApp", type: "string", description: "Sending application name", required: false },
    { name: "sendingFacility", type: "string", description: "Sending facility name", required: false },
    { name: "patientId", type: "string", description: "Patient identifier", required: false },
    { name: "patientName", type: "string", description: "Patient name (formatted for PID-5)", required: false },
    { name: "dateOfBirth", type: "string", description: "Patient date of birth (YYYYMMDD)", required: false },
    { name: "sex", type: "string", description: "Patient sex (M/F/O)", required: false },
    { name: "address", type: "string", description: "Patient address", required: false },
    { name: "phone", type: "string", description: "Patient phone number", required: false },
    { name: "customSegments", type: "array", description: "Array of additional segment strings to append (e.g., ['OBR|1|...', 'OBX|1|...'])", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const { messageType, eventType, sendingApp, sendingFacility, customSegments } = params;

    if (!messageType) {
      return { success: false, error: "messageType is required" };
    }

    const patientData: Record<string, string> = {};
    if (params.patientId) patientData.patientId = params.patientId;
    if (params.patientName) patientData.patientName = params.patientName;
    if (params.dateOfBirth) patientData.dateOfBirth = params.dateOfBirth;
    if (params.sex) patientData.sex = params.sex;
    if (params.address) patientData.address = params.address;
    if (params.phone) patientData.phone = params.phone;

    try {
      const message = buildHL7v2({
        messageType,
        eventType: eventType || "",
        sendingApp: sendingApp || "SIMPLERLIFE100",
        sendingFacility: sendingFacility || "SIMPLERLIFE100",
        patientData: Object.keys(patientData).length > 0 ? patientData : undefined,
        customSegments: customSegments as string[] | undefined,
      });

      // Parse back for validation
      const parsed = parseHL7v2(message);

      return {
        success: true,
        data: {
          message,
          segmentCount: message.split("\r").length,
          messageType,
          eventType: eventType || "",
          isValid: parsed.success,
          parsedPreview: parsed.success
            ? {
                messageType: parsed.data!.messageType,
                eventType: parsed.data!.eventType,
                segmentNames: parsed.data!.segments.map((s) => s.name),
              }
            : null,
        },
      };
    } catch (err: any) {
      return { success: false, error: `HL7 build error: ${err.message}` };
    }
  },
});

// ── Tool: fhir_search ────────────────────────────────────────────────────

registry.register({
  name: "fhir_search",
  description: "Build a FHIR R4 search query and return structured search parameters for querying a FHIR server. Supports filtering by any resource field, sorting, and pagination.",
  parameters: [
    { name: "resourceType", type: "string", description: "FHIR resource type (Patient, Observation, Encounter, Condition, etc.)", required: true },
    { name: "filters", type: "object", description: "Search filters as key-value pairs (e.g., { 'name': 'Smith', 'birthdate': 'eq1980-01-01' })", required: false },
    { name: "sort", type: "string", description: "Sort field with optional direction prefix (e.g., '-date' for descending)", required: false },
    { name: "limit", type: "number", description: "Maximum results to return (max 100)", required: false },
    { name: "offset", type: "number", description: "Pagination offset", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const { resourceType, filters, sort, limit, offset } = params;

    if (!resourceType) {
      return { success: false, error: "resourceType is required" };
    }

    const validTypes = [
      "Patient", "Observation", "Encounter", "Condition", "MedicationRequest",
      "DiagnosticReport", "Procedure", "Immunization", "AllergyIntolerance",
      "Organization", "Practitioner", "CarePlan", "DocumentReference",
      "Appointment", "Claim", "Coverage",
    ];

    if (!validTypes.includes(resourceType)) {
      return {
        success: false,
        error: `Unknown resourceType '${resourceType}'. Valid: ${validTypes.join(", ")}`,
      };
    }

    const queryString = buildFHIRSearchQuery(
      resourceType,
      (filters as Record<string, string>) || {},
      { sort: sort as string, limit: limit as number || 20, offset: offset as number || 0 },
    );

    // Build structured search parameters
    const searchParams: Record<string, any> = {
      resourceType,
      endpoint: `/fhir/R4/${queryString}`,
      filters: (filters as Record<string, string>) || {},
      pagination: {
        limit: (limit as number) || 20,
        offset: (offset as number) || 0,
      },
    };

    if (sort) searchParams.sort = sort;

    // Provide a sample FHIR response structure
    const sampleResource = getSampleResource(resourceType);

    return {
      success: true,
      data: {
        searchParams,
        queryString,
        sampleResource,
        instructions: `Use the FHIR server base URL (e.g., https://fhir.example.com/fhir/R4/) and append: ${queryString}`,
      },
    };
  },
});

function getSampleResource(resourceType: string): FHIRResource | null {
  switch (resourceType) {
    case "Patient":
      return buildFHIRPatient({ givenName: "John", familyName: "Doe", sex: "M" });
    case "Observation":
      return buildFHIRObservation({ code: "29463-7", display: "Body Weight", value: 70, unit: "kg" });
    case "Encounter":
      return buildFHIREncounter({ status: "in-progress", classCode: "AMB" });
    default:
      return { resourceType };
  }
}

// ── Tool: fhir_create ────────────────────────────────────────────────────

registry.register({
  name: "fhir_create",
  description: "Create (build) a FHIR R4 resource from structured data. Supports Patient, Observation, and Encounter resources with all required fields.",
  parameters: [
    { name: "resourceType", type: "string", description: "FHIR resource type: Patient, Observation, or Encounter", required: true },
    { name: "data", type: "object", description: "Resource data fields as key-value pairs", required: true },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const { resourceType, data } = params;

    if (!resourceType) {
      return { success: false, error: "resourceType is required" };
    }
    if (!data) {
      return { success: false, error: "data is required" };
    }

    let resource: FHIRResource;

    switch (resourceType) {
      case "Patient":
        resource = buildFHIRPatient(data as Record<string, any>);
        break;
      case "Observation":
        resource = buildFHIRObservation(data as Record<string, any>);
        break;
      case "Encounter":
        resource = buildFHIREncounter(data as Record<string, any>);
        break;
      default:
        return {
          success: false,
          error: `Unsupported resourceType '${resourceType}'. Supported: Patient, Observation, Encounter`,
        };
    }

    // Validate
    const validation = validateFHIRResource(resource);

    return {
      success: validation.valid,
      data: {
        resource,
        valid: validation.valid,
        validationErrors: validation.errors,
        instructions: validation.valid
          ? `POST this JSON to the FHIR server base URL + /${resourceType} (Content-Type: application/fhir+json)`
          : undefined,
      },
      error: validation.valid ? undefined : `Resource validation failed: ${validation.errors.join("; ")}`,
    };
  },
});

// ── Tool: fhir_validate ──────────────────────────────────────────────────

registry.register({
  name: "fhir_validate",
  description: "Validate a FHIR R4 resource against required fields and structural constraints. Checks resourceType, required fields per type, and structural integrity.",
  parameters: [
    { name: "resource", type: "object", description: "The FHIR resource JSON object to validate", required: true },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const resource = params.resource as FHIRResource;

    if (!resource) {
      return { success: false, error: "resource object is required" };
    }

    const validation = validateFHIRResource(resource);

    // Provide detailed field analysis
    const fieldAnalysis: Record<string, any> = {};
    if (resource.resourceType === "Patient") {
      fieldAnalysis.hasName = !!resource.name;
      fieldAnalysis.hasIdentifier = !!resource.identifier;
      fieldAnalysis.hasGender = !!resource.gender;
      fieldAnalysis.hasBirthDate = !!resource.birthDate;
      fieldAnalysis.fieldsCount = Object.keys(resource).length;
    } else if (resource.resourceType === "Observation") {
      fieldAnalysis.hasCode = !!resource.code;
      fieldAnalysis.hasStatus = !!resource.status;
      fieldAnalysis.hasSubject = !!resource.subject;
      fieldAnalysis.hasValue = !!(resource.valueQuantity || resource.valueString);
      fieldAnalysis.fieldsCount = Object.keys(resource).length;
    } else if (resource.resourceType === "Encounter") {
      fieldAnalysis.hasStatus = !!resource.status;
      fieldAnalysis.hasClass = !!resource.class;
      fieldAnalysis.hasSubject = !!resource.subject;
      fieldAnalysis.hasPeriod = !!resource.period;
      fieldAnalysis.fieldsCount = Object.keys(resource).length;
    } else {
      fieldAnalysis.fieldsCount = Object.keys(resource).length;
      fieldAnalysis.allFields = Object.keys(resource);
    }

    return {
      success: true,
      data: {
        valid: validation.valid,
        resourceType: resource.resourceType || "(missing)",
        errors: validation.errors,
        fieldAnalysis,
        suggestions: validation.errors.length > 0
          ? generateValidationSuggestions(resource.resourceType, validation.errors)
          : ["Resource is structurally valid for basic FHIR R4 conformance"],
      },
    };
  },
});

function generateValidationSuggestions(resourceType: string, errors: string[]): string[] {
  const suggestions: string[] = [];

  for (const err of errors) {
    if (err.includes("resourceType")) suggestions.push("Add a 'resourceType' field (e.g., 'Patient')");
    if (err.includes("name") && resourceType === "Patient") suggestions.push("Add a 'name' array with at least one name object containing 'family' and/or 'given'");
    if (err.includes("identifier") && resourceType === "Patient") suggestions.push("Add an 'identifier' array with at least one identifier object containing 'value'");
    if (err.includes("code") && resourceType === "Observation") suggestions.push("Add a 'code' object with 'coding' array containing system and code");
    if (err.includes("status")) suggestions.push(`Add a 'status' field (e.g., 'final', 'preliminary', 'registered')`);
    if (err.includes("class") && resourceType === "Encounter") suggestions.push("Add a 'class' object with 'system' and 'code' (e.g., AMB for ambulatory)");
  }

  return suggestions;
}

export {
  parseHL7v2,
  buildHL7v2,
  buildFHIRPatient,
  buildFHIRObservation,
  buildFHIREncounter,
  validateFHIRResource,
  buildFHIRSearchQuery,
};
