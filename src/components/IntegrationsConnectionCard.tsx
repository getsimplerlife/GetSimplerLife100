import React from "react";
import { Link } from "@tanstack/react-router";
import { Card, Badge, Button } from "./ui";
import { getProviderIcon } from "./IntegrationsProviderCard";

export interface Connection {
  id: string;
  userId: string;
  provider: string;
  displayName: string;
  config: any;
  status: "active" | "expired" | "error" | "pending";
  healthAt?: string | number | Date;
  errorMsg?: string;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
}

interface IntegrationsConnectionCardProps {
  connection: Connection;
  onDisconnect: (id: string) => void;
  onTest: (id: string) => void;
  isTesting?: boolean;
}

export const IntegrationsConnectionCard: React.FC<IntegrationsConnectionCardProps> = ({
  connection,
  onDisconnect,
  onTest,
  isTesting = false,
}) => {
  const icon = getProviderIcon(connection.provider);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="emerald">Active</Badge>;
      case "expired":
        return <Badge variant="warning">Expired</Badge>;
      case "error":
        return <Badge variant="danger">Error</Badge>;
      case "pending":
        return <Badge variant="blue" className="animate-pulse">Pending</Badge>;
      default:
        return <Badge variant="stone">{status}</Badge>;
    }
  };

  const formattedHealthAt = connection.healthAt
    ? new Date(connection.healthAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Never";

  return (
    <Card className="p-5 border border-stone-900 bg-stone-950 hover:border-stone-850 transition-all flex flex-col justify-between">
      <div className="space-y-4">
        {/* Logo and Status Badge Row */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 bg-stone-900 border border-stone-800 rounded-xl flex items-center justify-center text-xl shadow-md">
              {icon}
            </div>
            <div>
              <h3 className="text-xs font-bold text-white leading-snug">{connection.displayName}</h3>
              <span className="text-[9px] font-mono text-stone-500 uppercase tracking-widest block mt-0.5">
                {connection.provider}
              </span>
            </div>
          </div>
          <div>{getStatusBadge(connection.status)}</div>
        </div>

        {/* Health details segment table */}
        <div className="bg-stone-900/10 border border-stone-900/60 rounded-lg p-2.5 space-y-1.5 text-[9px] font-mono text-stone-500">
          <div className="flex justify-between">
            <span>HEALTH STATUS</span>
            <span className={`font-bold ${connection.status === "active" ? "text-emerald-500" : "text-rose-500"}`}>
              {connection.status === "active" ? "100% Operational" : connection.errorMsg || "Needs Re-auth"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>LAST HEALTH CHECK</span>
            <span className="text-stone-400 font-bold">{formattedHealthAt}</span>
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="border-t border-stone-900 pt-4 mt-5 flex justify-between items-center gap-2">
        <Link
          to={`/portal/integrations/${connection.id}` as any}
          className="text-emerald-400 hover:text-emerald-300 text-[10px] font-mono font-bold hover:underline"
        >
          View Logs & Details →
        </Link>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTest(connection.id)}
            loading={isTesting}
            className="text-[9px] font-mono py-1 px-2.5 rounded-lg"
          >
            Test Status
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDisconnect(connection.id)}
            className="text-[9px] font-mono py-1 px-2.5 rounded-lg text-rose-500 hover:text-rose-400 hover:bg-rose-950/20"
          >
            Disconnect
          </Button>
        </div>
      </div>
    </Card>
  );
};
