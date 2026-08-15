import { createFileRoute } from "@tanstack/react-router";
import ResourceLibrary from "~/components/ResourceLibrary";
import { resources } from "~/content/resources";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/resources/")({
  head: () => pageHead("/resources"),
  component: () => <ResourceLibrary resources={resources} />,
});
