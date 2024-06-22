import React from "react";
import { useQuery } from "@tanstack/react-query";
import { draftListRetrieve } from "../lib/data";

import DraftList from "../features/DraftList";

export const DraftDashboard = () => {
    // const { draft_id } = useQueryParams();
    const { data: draftListData } = useQuery({
        queryKey: ["draft_list"],
        queryFn: () =>
            draftListRetrieve(),
        select: (data) => {
            console.log(data)
            return data;
        }

    })

  return (
    <>
      <DraftList draft_list={draftListData?.data} />
    </>
  )
}