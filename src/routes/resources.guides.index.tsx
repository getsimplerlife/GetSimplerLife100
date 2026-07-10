import { createFileRoute } from "@tanstack/react-router";
import ResourceLibrary from "~/components/ResourceLibrary";
import { resources } from "~/content/resources";

export const Route = createFileRoute("/resources/guides/")({
  component: () => (
    <ResourceLibrary
      resources={resources.filter((r) => r.type === "guide")}
    />
  ),
});
