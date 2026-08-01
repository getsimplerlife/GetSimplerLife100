import { describe, expect, it } from "vitest";
import { processAgentResults } from "../lib/agent-processor";
const agent={id:"po-management-agent-v1",name:"PO Management",category:"procurement",instructions:""};
const base={providerId:"quickbooks",provider:"QuickBooks",status:"ok" as const,recordsFound:2,sampleData:[],endpoint:"vetted"};
describe("procurement processor",()=>{it("validates explicit PO objects and never schedules writes",()=>{const r=processAgentResults(agent,{integrationsUsed:[{...base,sampleData:[{id:"PO-1",vendorName:"Acme",totalAmount:120,status:"pending"},{id:"bad",total:4}],}],totalRecordsProcessed:2},[]);expect(r.processedData.metrics.totalOrders).toBe(1);expect(r.processedData.metrics.invalidRecords).toBe(1);expect(r.actionsTaken).toEqual([]);expect(r.alerts[0].requiresAttention).toBe(true);});});
