import React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { draftRetrieve } from "../lib/data";
import Draft from "./Draft";

// Resolves /draft/:draftId to the draft details Draft needs, so the board is
// deep-linkable (reload/bookmark) instead of depending on list-page selection.
export default function DraftPage() {
    const { draftId } = useParams();

    const { data: draftDetails } = useQuery({
        queryKey: ["draft_detail", draftId],
        queryFn: () =>
            draftRetrieve(draftId),
        select: (data) => {
            return data.data;
        }
    })

    if (!draftDetails) return <div>Loading...</div>;
    return <Draft draftDetails={draftDetails} />;
}
