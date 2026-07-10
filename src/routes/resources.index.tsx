import { createFileRoute } from "@tanstack/react-router";
import ResourceLibrary from "~/components/ResourceLibrary";
import { resources } from "~/content/resources";

export const Route = createFileRoute("/resources/")({
  component: () => <ResourceLibrary resources={resources} />,
});
